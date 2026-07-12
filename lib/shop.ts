import { prisma } from "./db";
import { requireUser } from "./session";
import { notFound } from "next/navigation";

/**
 * Tenant isolation helper. Every shop access goes through here so a signed-in
 * owner can only ever read/write their own shops. Returns the owner's shops.
 */
export async function getMyShops() {
  const user = await requireUser();
  return prisma.shop.findMany({
    where: { ownerId: user.id },
    orderBy: { createdAt: "asc" },
    include: { run: { include: { steps: true } } },
  });
}

/** Returns the owner's "current" shop (first one) or null if none yet. */
export async function getCurrentShop() {
  const shops = await getMyShops();
  return shops[0] ?? null;
}

/** Fetch a specific shop, 404-ing if it isn't owned by the current user. */
export async function getOwnedShop(shopId: string) {
  const user = await requireUser();
  const shop = await prisma.shop.findFirst({
    where: { id: shopId, ownerId: user.id },
    include: { run: { include: { steps: true } }, versions: true },
  });
  if (!shop) notFound();
  return shop;
}
