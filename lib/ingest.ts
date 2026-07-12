import "server-only";
import type { Shop } from "@prisma/client";
import { prisma } from "./db";
import type { CallIngest } from "./schemas";

// Shared call-recording core, used by BOTH the legacy /api/ingest/call endpoint
// (authed by per-shop ingest secret) and the native /api/agent/call-events
// endpoint (authed by the agent token). Handles the idempotent upsert and the
// real-time owner backstop so behavior is identical from either entry point.

export type ShopWithOwner = Shop & { owner: { email: string } | null };

/** Upsert a CallRecord and fire the owner backstop on genuinely-new
 *  booked/urgent calls. Never throws on the notify path. */
export async function recordCall(shop: ShopWithOwner, p: CallIngest) {
  const existing = await prisma.callRecord.findUnique({ where: { callId: p.call_id }, select: { id: true } });

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
    flags: (p.flags as never) ?? undefined,
  };

  const record = await prisma.callRecord.upsert({
    where: { callId: p.call_id },
    create: { callId: p.call_id, ...data },
    update: data,
  });

  if (!existing && (p.hot_job || p.booked) && shop.owner?.email) {
    const kind = p.hot_job ? "emergency" : "booked";
    const detail = p.booked && p.service ? `${p.service}${p.appt_time ? ` · ${p.appt_time}` : ""}` : (p.intent ?? "");
    const { notifyOwnerRealtimeCall } = await import("./notify");
    await notifyOwnerRealtimeCall(shop.owner.email, shop.businessName, kind, detail).catch((e) => console.error("realtime notify failed", e));
  }

  return record;
}

/** Map a Retell call-ended webhook body into our ingest payload shape. Mirrors
 *  what the old n8n "Map Call → Ingest" node did. Returns a raw object to be
 *  validated by callIngestSchema at the route. */
export function mapRetellCall(clientId: string, body: unknown, valueMap: Record<string, number>): Record<string, unknown> {
  const b = (body ?? {}) as Record<string, unknown>;
  const c = ((b.call as Record<string, unknown>) ?? b) as Record<string, unknown>;
  const analysis = (c.call_analysis as Record<string, unknown>) ?? {};
  const service = (analysis.service as string) ?? null;
  const outcome = analysis.booked ? "booked" : analysis.emergency ? "escalated" : analysis.message ? "message" : "no_action";
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
    est_job_value: Number((analysis.est_job_value as number) || (service ? valueMap[service] : 0) || 0),
    hot_job: !!analysis.emergency,
    recovered: !!analysis.recovered,
    transcript_url: (c.recording_url as string) || null,
    flags: analysis.flags ?? null,
  };
}
