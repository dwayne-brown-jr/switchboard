"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/session";
import { retryStep, advanceRun } from "@/lib/engine";

export async function retryStepAction(runId: string, key: string) {
  await requireAdmin();
  await retryStep(runId, key);
  revalidatePath("/admin");
}

export async function advanceRunAction(runId: string) {
  await requireAdmin();
  await advanceRun(runId);
  revalidatePath("/admin");
}

export async function seedCallsAction(shopId: string) {
  await requireAdmin();
  const { seedMockCalls } = await import("@/lib/mockCalls");
  await seedMockCalls(shopId, 40);
  revalidatePath(`/admin/shops/${shopId}`);
}

export async function clearCallsAction(shopId: string) {
  await requireAdmin();
  const { clearMockCalls } = await import("@/lib/mockCalls");
  await clearMockCalls(shopId);
  revalidatePath(`/admin/shops/${shopId}`);
}

export async function forwardingOverrideAction(shopId: string) {
  await requireAdmin();
  const { adminMarkVerified } = await import("@/lib/forwarding");
  await adminMarkVerified(shopId);
  revalidatePath(`/admin/shops/${shopId}`);
}

export async function sendDigestAction(shopId: string) {
  await requireAdmin();
  const { sendWeeklyDigest } = await import("@/lib/digest");
  await sendWeeklyDigest(shopId);
  revalidatePath(`/admin/shops/${shopId}`);
}

export async function pauseShopAdminAction(shopId: string) {
  await requireAdmin();
  const { pauseShopAgent } = await import("@/lib/lifecycle");
  await pauseShopAgent(shopId, "paused by operator");
  revalidatePath(`/admin/shops/${shopId}`);
}
