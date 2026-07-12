"use server";

import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import { createRun, saveWizardProgress, completeUserStep } from "@/lib/engine";
import { wizardSchema, type WizardData } from "@/lib/schemas";
import { scrapeWebsite } from "@/lib/scrape";
import { prefillFromWebsite } from "@/lib/llm";
import { isVertical, type Vertical } from "@/lib/verticals";
import type { PrefillResult } from "@/lib/schemas";

/** Returns the signed-in owner's current shop + run (first shop), or null. */
async function myShopWithRun(userId: string) {
  return prisma.shop.findFirst({
    where: { ownerId: userId },
    orderBy: { createdAt: "asc" },
    include: { run: true },
  });
}

/**
 * Save wizard progress (resumable). Creates the Shop + OnboardingRun on first
 * save. Syncs the owner-visible Shop columns and stores the full wizard payload
 * on the wizard step. Tenant-scoped: only ever touches the caller's own shop.
 */
export async function saveDraft(input: unknown): Promise<{ shopId: string; runId: string }> {
  const user = await requireUser();
  const data = wizardSchema.parse(input);

  let shop = await myShopWithRun(user.id);

  if (!shop) {
    const created = await prisma.shop.create({
      data: {
        ownerId: user.id,
        businessName: data.businessName.trim() || "My shop",
        vertical: data.vertical,
        city: data.city.trim() || null,
        timezone: data.timezone.trim() || null,
        websiteUrl: data.websiteUrl.trim() || null,
        businessNumber: data.businessNumber.trim() || null,
        ownerMobile: data.ownerMobile.trim() || null,
        status: "onboarding",
      },
      include: { run: true },
    });
    await createRun(created.id);
    shop = await myShopWithRun(user.id);
  } else {
    await prisma.shop.update({
      where: { id: shop.id },
      data: {
        businessName: data.businessName.trim() || shop.businessName,
        vertical: data.vertical,
        city: data.city.trim() || null,
        timezone: data.timezone.trim() || null,
        websiteUrl: data.websiteUrl.trim() || null,
        businessNumber: data.businessNumber.trim() || null,
        ownerMobile: data.ownerMobile.trim() || null,
      },
    });
    if (!shop.run) await createRun(shop.id);
  }

  const fresh = await myShopWithRun(user.id);
  if (!fresh?.run) throw new Error("Failed to create onboarding run");
  await saveWizardProgress(fresh.run.id, data);
  return { shopId: fresh.id, runId: fresh.run.id };
}

/**
 * Finish the wizard: persist the final answers, mark the wizard step done, and
 * advance the engine (which runs config → prompt → QA). Redirects to /app,
 * where the owner sees "Meet your receptionist" or the fixes they still need.
 */
export async function finishWizard(input: unknown) {
  const { runId } = await saveDraft(input);
  // Re-editing the wizard invalidates everything derived from the answers.
  // Reset the generation steps so they REBUILD from the new answers instead of
  // re-checking a stale config from a previous pass.
  await prisma.provisioningStep.updateMany({
    where: { runId, key: { in: ["generate_config", "generate_prompt", "qa_review"] } },
    data: { status: "pending" },
  });
  await completeUserStep(runId, "wizard", wizardSchema.parse(input));
  redirect("/app");
}

/** Website prefill "magic moment". Best-effort; returns empty on any failure. */
export async function runPrefill(url: string, vertical: string): Promise<PrefillResult> {
  const user = await requireUser();
  const { rateLimit } = await import("@/lib/ratelimit");
  if (!(await rateLimit("llm", user.id))) return { services: [], faqs: [], city: "", serviceArea: "" };
  const v: Vertical = isVertical(vertical) ? vertical : "auto";
  const text = await scrapeWebsite(url);
  if (!text) return { services: [], faqs: [], city: "", serviceArea: "" };
  return prefillFromWebsite(text, v);
}
