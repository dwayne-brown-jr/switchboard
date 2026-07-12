import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { callIngestSchema } from "@/lib/schemas";
import { secretEquals } from "@/lib/secure";

// Call ingest. n8n posts every processed call here. Authenticated by the shop's
// per-shop ingest secret (header x-ingest-secret or body.secret). Zod-validated;
// upserts CallRecord by callId (idempotent — replays don't duplicate).
export async function POST(req: Request) {
  const raw = await req.json().catch(() => null);
  const parsed = callIngestSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid payload", issues: parsed.error.issues }, { status: 400 });
  }
  const p = parsed.data;

  const secret = req.headers.get("x-ingest-secret") ?? (raw as { secret?: string })?.secret ?? "";
  const shop = await prisma.shop.findUnique({ where: { id: p.client_id }, include: { owner: true } });
  if (!shop || !secretEquals(shop.ingestSecret, secret)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // First time we've seen this call? (Replays must not re-notify.)
  const existing = await prisma.callRecord.findUnique({ where: { callId: p.call_id }, select: { id: true } });

  const { rateLimit } = await import("@/lib/ratelimit");
  if (!(await rateLimit("ingest", shop.id))) {
    return NextResponse.json({ error: "rate limited" }, { status: 429 });
  }

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

  // Real-time owner backstop — only on genuinely new booked/urgent calls, and
  // never blocking the response to the caller pipeline.
  if (!existing && (p.hot_job || p.booked) && shop.owner?.email) {
    const kind = p.hot_job ? "emergency" : "booked";
    const detail = p.booked && p.service ? `${p.service}${p.appt_time ? ` · ${p.appt_time}` : ""}` : (p.intent ?? "");
    const { notifyOwnerRealtimeCall } = await import("@/lib/notify");
    await notifyOwnerRealtimeCall(shop.owner.email, shop.businessName, kind, detail).catch((e) => console.error("realtime notify failed", e));
  }

  return NextResponse.json({ ok: true, id: record.id });
}
