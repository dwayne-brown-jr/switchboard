import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { prisma } from "@/lib/db";
import type { ShopConfig } from "@/lib/schemas";
import { buildRegistration } from "@/lib/integrations/n8nRegistry";
import { secretEquals } from "@/lib/secure";
import { rateLimit } from "@/lib/ratelimit";

// Broker lookup. The n8n flows call this (instead of relying on n8n's
// unreliable cross-execution static data) to get a shop's live config: the
// Cal.com event-type map, timezone, owner mobile, agent number, A2P status, and
// the ingest URL + secret. Authenticated by the shared N8N_REGISTRY_TOKEN.
export async function GET(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (!(await rateLimit("broker", ip))) {
    return NextResponse.json({ error: "rate limited" }, { status: 429 });
  }

  const token = process.env.N8N_REGISTRY_TOKEN;
  const auth = req.headers.get("authorization") ?? "";
  if (token && !secretEquals(auth, `Bearer ${token}`)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const clientId = new URL(req.url).searchParams.get("client_id");
  if (!clientId) return NextResponse.json({ error: "missing client_id" }, { status: 400 });

  const shop = await prisma.shop.findUnique({ where: { id: clientId } });
  if (!shop) return NextResponse.json({ error: "unknown client_id" }, { status: 404 });

  // Ensure an ingest secret exists (idempotent).
  let ingestSecret = shop.ingestSecret;
  if (!ingestSecret) {
    ingestSecret = crypto.randomBytes(24).toString("hex");
    await prisma.shop.update({ where: { id: shop.id }, data: { ingestSecret } });
  }

  const version = await prisma.agentVersion.findFirst({
    where: { shopId: shop.id, status: { in: ["live", "approved"] } },
    orderBy: { createdAt: "desc" },
  });
  const config = version?.config as unknown as ShopConfig | undefined;
  if (!config) return NextResponse.json({ error: "no config" }, { status: 404 });

  const fresh = await prisma.shop.findUnique({ where: { id: shop.id } });
  return NextResponse.json(buildRegistration(fresh!, config, ingestSecret));
}
