import "server-only";
import type { Shop } from "@prisma/client";
import { prisma } from "./db";
import type { CallIngest } from "./schemas";
import { fuzzyMatchKey } from "./match-service";

// Shared call-recording core, used by BOTH the legacy /api/ingest/call endpoint
// (authed by per-shop ingest secret) and the native /api/agent/call-events
// endpoint (authed by the agent token). Handles the idempotent upsert and the
// real-time owner backstop so behavior is identical from either entry point.

export type ShopWithOwner = Shop & { owner: { email: string } | null };

/** Upsert a CallRecord and fire the owner backstop on genuinely-new
 *  booked/urgent calls. Never throws on the notify path. */
export async function recordCall(shop: ShopWithOwner, p: CallIngest) {
  const existing = await prisma.callRecord.findUnique({ where: { callId: p.call_id }, select: { id: true } });

  // Customer layer: resolve the caller to a Customer before writing, so the
  // link lands in the same upsert rather than needing a second write. Safe by
  // construction — returns null on an unnormalizable number (blocked caller ID)
  // and never throws, because losing a CallRecord to a CRM failure would be a
  // far worse trade than losing the link. Both this path and the mid-call
  // create_booking path upsert on CustomerPhone's unique index, so whichever
  // arrives first wins and the other resolves to the same customer.
  const { resolveCustomerSafe, refreshRollupsSafe } = await import("./customer");
  const customer = await resolveCustomerSafe(shop.id, p.caller_phone, { at: new Date(p.timestamp) });

  // Applied to create AND update, but only when we actually resolved someone.
  // This upsert re-runs on every webhook retry, so writing `customerId: null`
  // on a miss would let one transient resolution failure — or one call from a
  // number we can't normalize — erase a link a previous run or the backfill had
  // already established. Absence of a customer is not evidence there isn't one.
  const linkage = customer ? { customerId: customer.id } : {};

  const data = {
    shopId: shop.id,
    timestamp: new Date(p.timestamp),
    afterHours: p.after_hours,
    durationSec: p.duration_sec,
    callerPhone: p.caller_phone ?? null,
    intent: p.intent ?? null,
    outcome: p.outcome ?? null,
    booked: p.booked,
    service: p.service ?? null,
    apptTime: p.appt_time ?? null,
    estJobValue: p.est_job_value,
    hotJob: p.hot_job,
    recovered: p.recovered,
    transcriptUrl: p.transcript_url ?? null,
    summary: p.summary ?? null,
    transcript: p.transcript ?? null,
    flags: (p.flags as never) ?? undefined,
  };

  // Remember what the call was about — the vehicle, property or unit. The agent
  // asks for it on nearly every call and we used to throw it away, so a
  // ten-year customer recited their own truck every time they rang. Once it's a
  // CustomerAsset, lookup_customer can hand it back on the NEXT call.
  // Best-effort and non-blocking: never risk a CallRecord over a nicety.
  if (customer) await rememberAssetSafe(shop, customer.id, p.asset);

  const record = await prisma.callRecord.upsert({
    where: { callId: p.call_id },
    create: { callId: p.call_id, ...data, ...linkage },
    update: { ...data, ...linkage },
  });

  // Rollups after the write, so callCount/lifetimeValue/stage reflect this call.
  // Best-effort: the nightly customer-rollups job repairs any drift.
  await refreshRollupsSafe(customer?.id);

  // Forwarding self-verify: while a shop is still onboarding, an inbound call
  // during an active forwarding-verification window IS the proof that call
  // forwarding works. Nothing else completes that step now that the n8n broker
  // is gone, so it's wired here — fires for ANY call (a verification call isn't
  // "booked" or "urgent"). markVerified is a safe no-op unless the forwarding
  // step is actively "verifying" within its window. Best-effort; never blocks.
  if (shop.status !== "live") {
    const { markVerified } = await import("./forwarding");
    await markVerified(shop.id).catch((e) => console.error("forwarding auto-verify failed", e));
  }

  // Real-time owner backstop — only on genuinely-new booked/urgent calls.
  if (!existing && (p.hot_job || p.booked)) {
    const kind = p.hot_job ? "emergency" : "booked";
    const detail = p.booked && p.service ? `${p.service}${p.appt_time ? ` · ${p.appt_time}` : ""}` : (p.intent ?? "");

    // Email — both booked and emergency.
    if (shop.owner?.email) {
      const { notifyOwnerRealtimeCall } = await import("./notify");
      await notifyOwnerRealtimeCall(shop.owner.email, shop.businessName, kind, detail).catch((e) => console.error("realtime notify failed", e));
    }

    // Push to the owner's mobile app devices — both booked and emergency.
    // callId/callerPhone let the app deep-link to the call and offer a
    // call-back action straight from the notification.
    {
      const { pushToOwner } = await import("./push");
      const title = kind === "emergency" ? `🚨 Emergency — ${shop.businessName}` : `📅 New booking — ${shop.businessName}`;
      const fallback = kind === "emergency" ? "Urgent call flagged" : "New job booked";
      await pushToOwner(shop.ownerId, {
        title,
        body: detail || fallback,
        data: { kind, shopId: shop.id, callId: record.id, callerPhone: p.caller_phone ?? null },
        categoryId: p.caller_phone ? "call" : undefined,
      }).catch((e) => console.error("owner push failed", e));
    }

    // SMS — on BOOKINGS only. Emergencies are already texted by the agent's
    // notify_owner tool mid-call, so a second text here would just be a dup.
    // Gated on A2P approval + no STOP on file (compliance) + an owner mobile
    // + the shop's number.
    const { canSendSms } = await import("./a2p");
    if (kind === "booked" && canSendSms(shop) && shop.ownerMobile && shop.agentNumber) {
      const { sendSms } = await import("./integrations/twilio");
      const { toE164 } = await import("./phone");
      const to = toE164(shop.ownerMobile);
      if (to) {
        const when = p.appt_time
          ? ` for ${new Date(p.appt_time).toLocaleString("en-US", { timeZone: shop.timezone ?? "America/Chicago", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}`
          : "";
        const svc = p.service ? ` (${p.service})` : "";
        const body = `📅 New booking${svc}${when} — ${shop.businessName}. Details on your dashboard.`;
        const { withOptOut } = await import("./sms-consent");
        await sendSms(to, shop.agentNumber, withOptOut(body)).catch((e) => console.error("booking SMS failed", e));
      }
    }
  }

  return record;
}

/** Which kind of asset a shop services, so the label lands under the right icon. */
export function assetKindFor(vertical: string | null): "vehicle" | "property" | "equipment" {
  if (!vertical) return "property";
  if (vertical.startsWith("auto")) return "vehicle";
  if (vertical === "hvac") return "equipment";
  return "property";
}

/**
 * Record the vehicle/property a call was about, if we don't already have it.
 *
 * Deliberately conservative. The label comes from a voice model transcribing a
 * phone call, so it is noisy by nature: we skip anything implausibly short or
 * long, and match case-insensitively against what's on file so "2016 nissan
 * pathfinder" doesn't become a second row next to "2016 Nissan Pathfinder".
 * Getting a duplicate wrong is worse than missing one — the agent reads these
 * back to the caller.
 *
 * Never throws: a CRM nicety must not endanger the call record.
 */
export async function rememberAssetSafe(
  shop: { id: string; vertical: string | null },
  customerId: string,
  rawLabel: string | null | undefined,
): Promise<void> {
  try {
    const label = rawLabel?.trim();
    if (!label || label.length < 4 || label.length > 120) return;

    const existing = await prisma.customerAsset.findMany({ where: { customerId }, select: { id: true, label: true } });
    if (existing.some((a) => a.label.toLowerCase() === label.toLowerCase())) return;

    // Cap it. A customer with six "vehicles" is transcription noise, not a
    // fleet, and the agent should not be reading a list back to anyone.
    if (existing.length >= 5) return;

    await prisma.customerAsset.create({
      data: { customerId, kind: assetKindFor(shop.vertical), label },
    });
  } catch (e) {
    console.error("remember asset failed", e);
  }
}

/** Map a Retell call-ended webhook body into our ingest payload shape. Mirrors
 *  what the old n8n "Map Call → Ingest" node did. Returns a raw object to be
 *  validated by callIngestSchema at the route. */
export function mapRetellCall(clientId: string, body: unknown, valueMap: Record<string, number>): Record<string, unknown> {
  const b = (body ?? {}) as Record<string, unknown>;
  const c = ((b.call as Record<string, unknown>) ?? b) as Record<string, unknown>;
  const ca = (c.call_analysis as Record<string, unknown>) ?? {};
  // Retell puts our configured post-call fields under custom_analysis_data; fall
  // back to the top level in case a payload delivers them flat.
  const analysis = { ...(ca as Record<string, unknown>), ...((ca.custom_analysis_data as Record<string, unknown>) ?? {}) };
  const service = (analysis.service as string) ?? null;
  const outcome = analysis.booked ? "booked" : analysis.emergency ? "escalated" : analysis.message ? "message" : "no_action";
  // Revenue fallback: the analysis `service` is often verbose free text ("routine
  // oil change for my 2018 BMW"), so fuzzy-match it to a service_value_map key
  // rather than exact lookup (which would miss → $0).
  const valueKey = fuzzyMatchKey(Object.keys(valueMap), service);
  const mappedValue = valueKey ? valueMap[valueKey] : 0;
  return {
    client_id: clientId,
    call_id: (c.call_id as string) || `call_${Date.now()}`,
    timestamp: new Date((c.start_timestamp as number) || Date.now()).toISOString(),
    after_hours: !!analysis.after_hours,
    duration_sec: Math.round(((c.duration_ms as number) || 0) / 1000),
    caller_phone: (c.from_number as string) || null,
    intent: (analysis.intent as string) || null,
    outcome,
    booked: !!analysis.booked,
    service,
    appt_time: (analysis.appt_time as string) || null,
    est_job_value: Math.max(0, Math.round(Number((analysis.est_job_value as number) || mappedValue || 0)) || 0),
    hot_job: !!analysis.emergency,
    recovered: !!analysis.recovered,
    transcript_url: (c.recording_url as string) || null,
    // Retell generates these on every analyzed call — free triage material for
    // the owner app (2-line summary beats a 4-minute recording).
    summary: (ca.call_summary as string) || null,
    transcript: (c.transcript as string) || null,
    asset: (analysis.asset as string) || null,
    flags: analysis.flags ?? null,
  };
}
