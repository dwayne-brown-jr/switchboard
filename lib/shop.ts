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

/**
 * The id of the shop the signed-in owner is acting on.
 *
 * This is the ONE place that decides *which* shop, deliberately separated from
 * *what fields* — callers still write their own `include`, which is why this
 * returns an id rather than a record.
 *
 * It matters because the rule here is currently wrong for anyone with more than
 * one shop: it picks the oldest, so a second shop is silently unreachable (see
 * BACKLOG "Multi-shop owner UI"). That bug used to be copy-pasted across the
 * dashboard, settings and go-live. Now the shop switcher changes one function
 * instead of hunting for every `findFirst({ ownerId })` in the codebase.
 */
export async function currentShopId(): Promise<string | null> {
  const user = await requireUser();
  const shop = await prisma.shop.findFirst({
    where: { ownerId: user.id },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  return shop?.id ?? null;
}

/** Same, for server actions that cannot proceed without a shop. */
export async function requireShopId(): Promise<string> {
  const id = await currentShopId();
  if (!id) throw new Error("No shop found.");
  return id;
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
