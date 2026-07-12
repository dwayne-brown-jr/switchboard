import "server-only";
import { prisma } from "./db";
import { verifyPayload } from "./secure";
import type { ShopWithOwner } from "./ingest";

// Auth for the native agent tool/webhook routes. The tool URLs baked into the
// Retell agent carry ?client_id=<shopId>&token=<hmac(agent:shopId)>. We verify
// the HMAC and load the shop — no vendor signature needed, and random callers
// can't hit these endpoints for a shop they don't hold the token for.
export async function authAgentShop(url: URL): Promise<ShopWithOwner | null> {
  const clientId = url.searchParams.get("client_id");
  const token = url.searchParams.get("token");
  if (!clientId || !verifyPayload(`agent:${clientId}`, token)) return null;
  return prisma.shop.findUnique({ where: { id: clientId }, include: { owner: true } });
}
