import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { callIngestSchema } from "@/lib/schemas";
import { secretEquals } from "@/lib/secure";
import { recordCall } from "@/lib/ingest";
import { rateLimit } from "@/lib/ratelimit";

// Legacy call-ingest endpoint (kept for external posters). Authenticated by the
// shop's per-shop ingest secret (header x-ingest-secret or body.secret).
// Zod-validated; the shared recordCall() upserts by callId (idempotent) and
// fires the owner backstop. New calls flow through /api/agent/call-events.
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

  if (!(await rateLimit("ingest", shop.id))) {
    return NextResponse.json({ error: "rate limited" }, { status: 429 });
  }

  const record = await recordCall(shop, p);
  return NextResponse.json({ ok: true, id: record.id });
}
