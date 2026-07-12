import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { markVerified } from "@/lib/forwarding";
import { secretEquals } from "@/lib/secure";
import { rateLimit } from "@/lib/ratelimit";
import { clientIp } from "@/lib/clientip";

// Called when the shop's agent receives the forwarded verification call (posted
// by n8n / the voice provider). Authenticated by the shop's ingest secret so
// only the real flow can confirm forwarding. Correlates within the time window.
export async function POST(req: Request) {
  // Rate-limit by client IP before any lookup so the shopId+secret pair can't be
  // brute-forced from a single source.
  const ip = clientIp(req);
  if (!(await rateLimit("forwarding", ip))) {
    return NextResponse.json({ error: "rate limited" }, { status: 429 });
  }

  const body = (await req.json().catch(() => ({}))) as { client_id?: string; secret?: string };
  const shopId = body.client_id;
  const secret = body.secret ?? req.headers.get("x-ingest-secret") ?? "";
  if (!shopId) return NextResponse.json({ error: "missing client_id" }, { status: 400 });

  const shop = await prisma.shop.findUnique({ where: { id: shopId } });
  if (!shop || !secretEquals(shop.ingestSecret, secret)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const ok = await markVerified(shopId);
  return NextResponse.json({ verified: ok });
}
