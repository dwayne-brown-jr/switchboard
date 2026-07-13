import "server-only";
import type { Shop } from "@prisma/client";
import { prisma } from "./db";
import { generateConfig, generatePrompt, qaReview } from "./llm";
import { wizardSchema, type WizardData, type ShopConfig, type QaResult } from "./schemas";
import { getVoiceProvider } from "./integrations/voice";
import { toE164 } from "./phone";
import { logAudit } from "./audit";

// Post-launch edits: every change becomes a new AgentVersion that must pass QA
// before it can be Published to the live agent. Rollback re-points to a prior
// approved version. Owners never touch a raw prompt — only structured fields.

/** Convert a stored config back into editable wizard-shaped data. */
export function configToWizard(config: ShopConfig, shop: Shop): WizardData {
  return wizardSchema.parse({
    businessName: shop.businessName,
    vertical: config.vertical,
    city: config.city ?? "",
    timezone: shop.timezone ?? "",
    websiteUrl: shop.websiteUrl ?? "",
    businessNumber: shop.businessNumber ?? "",
    ownerMobile: shop.ownerMobile ?? "",
    serviceArea: config.service_area ?? "",
    services: config.services,
    hours: config.hours,
    faqs: config.faqs,
    emergencies: { rules: config.hot_job_rules, alertNumber: config.escalation.alert_number ?? "" },
    voice: config.voice,
    greeting: config.greeting ?? "",
    step: 6,
  });
}

export type DraftResult =
  | { ok: false; missing: string[] }
  | { ok: true; versionId: string; qa: QaResult };

/** Build a new draft version from edited fields + run QA. Does not publish. */
export async function createDraft(shopId: string, wizardInput: unknown, actorId?: string): Promise<DraftResult> {
  const wizard = wizardSchema.parse(wizardInput);
  const config = generateConfig(wizard, shopId);
  if (config.missing.length > 0) return { ok: false, missing: config.missing };

  const systemPrompt = await generatePrompt(config);
  const qa = await qaReview(systemPrompt, config);

  // Owner mobile is a contact detail (alerts + live-handoff target), not agent
  // behavior — persist it to the shop immediately so it's current even before
  // publish. The live agent's transfer number is synced at publish time.
  // Normalize to E.164 on save so the transfer target + booking SMS always get
  // a valid number (fall back to the raw value only if it can't be parsed).
  await prisma.shop.update({ where: { id: shopId }, data: { ownerMobile: toE164(wizard.ownerMobile) ?? (wizard.ownerMobile?.trim() || null) } });

  // Replace any existing un-published draft so history stays clean.
  await prisma.agentVersion.deleteMany({ where: { shopId, status: "draft" } });
  const version = await prisma.agentVersion.create({
    data: {
      shopId,
      config,
      systemPrompt,
      qaVerdict: qa.verdict,
      qaFlags: qa.flags,
      status: qa.verdict === "go" ? "approved" : "draft",
    },
  });
  await logAudit(shopId, actorId ?? null, "settings.draft_created", { qa: qa.verdict });
  return { ok: true, versionId: version.id, qa };
}

/** Publish an approved version to the live agent. */
export async function publishVersion(shopId: string, versionId: string, actorId?: string) {
  const shop = await prisma.shop.findUnique({ where: { id: shopId } });
  const version = await prisma.agentVersion.findFirst({ where: { id: versionId, shopId } });
  if (!shop || !version) throw new Error("Version not found.");
  if (version.qaVerdict !== "go") throw new Error("This version hasn't passed the quality check yet.");

  const config = version.config as unknown as ShopConfig;

  // Update the live agent (voice + prompt) via the provider.
  if (shop.agentId && shop.agentProvider) {
    const provider = getVoiceProvider(shop.agentProvider);
    await provider
      .updateAgent(shop.agentId, { systemPrompt: version.systemPrompt, voice: config.voice, greeting: config.greeting ?? "" })
      .catch((e) => {
        throw new Error(`Couldn't update your live receptionist: ${(e as Error).message}`);
      });
    // Sync the live human-handoff transfer number to the owner's current mobile
    // (best-effort — a stale transfer number shouldn't block a settings publish).
    await provider.updateTransferNumber?.(shop.agentId, shop.ownerMobile).catch(() => {});
  }
  // Edited hours take effect immediately: availability is computed live from the
  // published config (lib/scheduling), so there's no external calendar to sync.

  await prisma.agentVersion.updateMany({ where: { shopId, status: "live" }, data: { status: "archived" } });
  await prisma.agentVersion.update({ where: { id: version.id }, data: { status: "live" } });
  await prisma.shop.update({ where: { id: shopId }, data: { liveVersionId: version.id } });
  await logAudit(shopId, actorId ?? null, "settings.published", { versionId });
}

/** Roll back to a prior version (re-publish it). */
export async function rollbackTo(shopId: string, versionId: string, actorId?: string) {
  const version = await prisma.agentVersion.findFirst({ where: { id: versionId, shopId } });
  if (!version) throw new Error("Version not found.");
  // Only approved/archived versions that once passed QA can be rolled back to.
  if (version.qaVerdict !== "go") throw new Error("That version didn't pass the quality check.");
  await publishVersion(shopId, versionId, actorId);
  await logAudit(shopId, actorId ?? null, "settings.rolled_back", { versionId });
}
