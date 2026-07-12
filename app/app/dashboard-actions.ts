"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import { pauseShopAgent, resumeShopAgent } from "@/lib/lifecycle";

async function ownShop(userId: string, shopId: string) {
  const shop = await prisma.shop.findFirst({ where: { id: shopId, ownerId: userId } });
  if (!shop) throw new Error("Not found.");
  return shop;
}

export async function pauseShop(shopId: string) {
  const user = await requireUser();
  await ownShop(user.id, shopId);
  await pauseShopAgent(shopId, "owner paused from dashboard", user.id);
  revalidatePath("/app");
}

export async function resumeShop(shopId: string) {
  const user = await requireUser();
  await ownShop(user.id, shopId);
  await resumeShopAgent(shopId, user.id);
  revalidatePath("/app");
}
