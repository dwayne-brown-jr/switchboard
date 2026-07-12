import { prisma } from "../db";
import { generateConfig, generatePrompt, qaReview } from "../llm";
import { wizardSchema, type ShopConfig } from "../schemas";
import { type AutoHandler, done, needsUser, failed } from "./types";

// Reads the wizard payload the owner filled in (stored on the `wizard` step).
async function loadWizard(runId: string) {
  const wizardStep = await prisma.provisioningStep.findUnique({
    where: { runId_key: { runId, key: "wizard" } },
  });
  const parsed = wizardSchema.safeParse(wizardStep?.result ?? {});
  return parsed.success ? parsed.data : null;
}

// Finds the current draft version for this shop, if any.
async function currentDraft(shopId: string) {
  return prisma.agentVersion.findFirst({
    where: { shopId, status: "draft" },
    orderBy: { createdAt: "desc" },
  });
}

// ---------------------------------------------------------------------------
// generate_config — assemble the structured config from wizard answers.
// Idempotent: writes the config onto a draft AgentVersion (creates one if
// needed). Blocks with a friendly "we still need X" if required fields missing.
// ---------------------------------------------------------------------------
export const generateConfigHandler: AutoHandler = async ({ shop, run }) => {
  const wizard = await loadWizard(run.id);
  if (!wizard) return failed("Wizard answers are missing. Please complete setup again.");

  let config: ShopConfig;
  try {
    config = generateConfig(wizard, shop.id);
  } catch (e) {
    return failed(`Could not build the configuration: ${(e as Error).message}`);
  }

  if (config.missing.length > 0) {
    // Not an error — the owner just needs to fill a few fields. Send them back.
    return needsUser("We still need a little more information to build your receptionist.", {
      missing: config.missing,
      backTo: "wizard",
    });
  }

  const draft = await currentDraft(shop.id);
  if (draft) {
    await prisma.agentVersion.update({ where: { id: draft.id }, data: { config } });
  } else {
    await prisma.agentVersion.create({
      data: { shopId: shop.id, config, systemPrompt: "", status: "draft" },
    });
  }
  return done({ ok: true });
};

// ---------------------------------------------------------------------------
// generate_prompt — fill the vertical template from the config.
// Idempotent: overwrites systemPrompt on the same draft.
// ---------------------------------------------------------------------------
export const generatePromptHandler: AutoHandler = async ({ shop }) => {
  const draft = await currentDraft(shop.id);
  if (!draft) return failed("No draft version to generate a prompt for.");
  const config = draft.config as unknown as ShopConfig;
  const systemPrompt = await generatePrompt(config);
  await prisma.agentVersion.update({ where: { id: draft.id }, data: { systemPrompt } });
  return done();
};

// ---------------------------------------------------------------------------
// qa_review — the safety gate. Stores the verdict on the draft. A no_go blocks
// the pipeline with a plain-language fix list; a go approves the version.
// ---------------------------------------------------------------------------
export const qaReviewHandler: AutoHandler = async ({ shop }) => {
  const draft = await currentDraft(shop.id);
  if (!draft) return failed("No draft version to review.");
  const config = draft.config as unknown as ShopConfig;
  const result = await qaReview(draft.systemPrompt, config);

  await prisma.agentVersion.update({
    where: { id: draft.id },
    data: {
      qaVerdict: result.verdict,
      qaFlags: result.flags,
      status: result.verdict === "go" ? "approved" : "draft",
    },
  });

  if (result.verdict === "no_go") {
    return needsUser("Your receptionist needs a couple of fixes before it can go live.", {
      flags: result.flags,
      backTo: "wizard",
    });
  }
  return done({ flags: result.flags });
};
