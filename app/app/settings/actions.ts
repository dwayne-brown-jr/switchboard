"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import { createDraft, publishVersion, rollbackTo, type DraftResult } from "@/lib/versioning";

async function myShop(userId: string) {
  const shop = await prisma.shop.findFirst({ where: { ownerId: userId }, orderBy: { createdAt: "asc" } });
  if (!shop) throw new Error("No shop found.");
  return shop;
}

/** Save edits → build a draft version + run QA. Returns the QA result (does not publish). */
export async function saveSettings(data: unknown): Promise<DraftResult> {
  const user = await requireUser();
  const { rateLimit } = await import("@/lib/ratelimit");
  if (!(await rateLimit("llm", user.id))) return { ok: false, missing: ["Too many changes at once — give it a minute and try again."] };
  const shop = await myShop(user.id);
  const result = await createDraft(shop.id, data, user.id);
  revalidatePath("/app/settings");
  return result;
}

/** Publish a passed draft to the live receptionist. */
export async function publishSettings(versionId: string): Promise<{ ok: boolean; error?: string }> {
  const user = await requireUser();
  const shop = await myShop(user.id);
  try {
    await publishVersion(shop.id, versionId, user.id);
    revalidatePath("/app/settings");
    revalidatePath("/app");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/** Roll back to a previous version. */
export async function rollbackSettings(versionId: string): Promise<{ ok: boolean; error?: string }> {
  const user = await requireUser();
  const shop = await myShop(user.id);
  try {
    await rollbackTo(shop.id, versionId, user.id);
    revalidatePath("/app/settings");
    revalidatePath("/app");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
