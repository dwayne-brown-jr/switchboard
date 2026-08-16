import "server-only";
import type { AgentSnapshot } from "./integrations/voice";

// Detecting when a LIVE agent no longer matches what the code says it should be.
//
// ---------------------------------------------------------------------------
// WHY THIS EXISTS
// ---------------------------------------------------------------------------
// Twice in one day the same bug shipped: configuration defined in code reached
// only newly-provisioned shops, because it was sent at agent creation and never
// on update. First tools (`agentFunctions`), then post-call analysis fields
// (`POST_CALL_ANALYSIS`).
//
// Neither failed loudly. A missing tool makes the agent reach for something
// that isn't there; a missing analysis field just means the value never comes
// back and the code consuming it sits dead. Both looked like feature bugs, and
// both were found by hand, mid-call, on a live shop.
//
// The pattern is structural, not careless: the app is the source of truth for
// config that physically lives in someone else's system, and nothing compared
// the two. This does.

/** One thing that's wrong with a live agent. */
export interface DriftIssue {
  shopId: string;
  businessName: string;
  kind: "missing_tool" | "extra_tool" | "missing_analysis_field" | "missing_prompt_section" | "unresolved_token" | "unreadable";
  detail: string;
}

export interface ExpectedConfig {
  toolNames: string[];
  analysisFields: string[];
  /** Sections the rendered prompt must contain (the baked guardrails). */
  promptSections: string[];
}

/**
 * Compare one agent's live configuration against what the code expects.
 *
 * Pure, so the interesting logic is testable without touching a provider.
 *
 * Extra tools are reported but are NOT treated the same as missing ones: a tool
 * we no longer generate is usually a leftover from an older deploy, which is
 * untidy rather than broken. A missing tool is a promise the prompt makes that
 * the agent can't keep.
 */
export function diffAgentConfig(
  shop: { id: string; businessName: string },
  expected: ExpectedConfig,
  actual: AgentSnapshot,
): DriftIssue[] {
  const issues: DriftIssue[] = [];
  const add = (kind: DriftIssue["kind"], detail: string) =>
    issues.push({ shopId: shop.id, businessName: shop.businessName, kind, detail });

  const liveTools = new Set(actual.toolNames);
  for (const t of expected.toolNames) {
    if (!liveTools.has(t)) add("missing_tool", `tool "${t}" is not registered on the live agent`);
  }
  for (const t of actual.toolNames) {
    // transfer_call is configured at the number/transfer layer, not by
    // agentFunctions, so it is expected to be present and unlisted.
    if (t === "transfer_to_human") continue;
    if (!expected.toolNames.includes(t)) add("extra_tool", `live agent has an unexpected tool "${t}"`);
  }

  const liveFields = new Set(actual.analysisFields);
  for (const f of expected.analysisFields) {
    if (!liveFields.has(f)) add("missing_analysis_field", `post-call analysis field "${f}" is missing — anything reading it will stay empty`);
  }

  // Only meaningful when we could read a prompt at all.
  if (actual.systemPrompt) {
    for (const s of expected.promptSections) {
      if (!actual.systemPrompt.includes(s)) add("missing_prompt_section", `prompt is missing the "${s}" section`);
    }
    // The {BUSINESS_NAME} class of bug: a token that reached a live agent and
    // gets read aloud to callers.
    for (const tok of new Set(actual.systemPrompt.match(/\{[A-Z_]+\}/g) ?? [])) {
      add("unresolved_token", `prompt contains the literal placeholder ${tok} — the agent will say it out loud`);
    }
  }

  return issues;
}

/**
 * Check every live shop's agent against the code.
 *
 * A shop we can't read is itself reported — silence from a provider is not
 * evidence of health, and "we stopped being able to see it" is exactly the sort
 * of thing that should surface before a customer finds it.
 */
export async function checkAllAgents(): Promise<{ checked: number; issues: DriftIssue[] }> {
  const { prisma } = await import("./db");
  const { getVoiceProvider } = await import("./integrations/voice");
  const { agentFunctions } = await import("./integrations/agentTools");
  const { POST_CALL_ANALYSIS } = await import("./integrations/retell");
  const { REQUIRED_PROMPT_SECTIONS } = await import("./llm");

  const shops = await prisma.shop.findMany({
    where: { status: "live", agentId: { not: null }, agentProvider: { not: null } },
    select: { id: true, businessName: true, agentId: true, agentProvider: true },
  });

  const issues: DriftIssue[] = [];
  let checked = 0;

  for (const shop of shops) {
    const expected: ExpectedConfig = {
      toolNames: agentFunctions(shop.id).map((f) => f.name),
      analysisFields: POST_CALL_ANALYSIS.map((f) => f.name),
      promptSections: REQUIRED_PROMPT_SECTIONS,
    };
    try {
      const provider = getVoiceProvider(shop.agentProvider!);
      if (!provider.describeAgent) continue; // provider can't report; not drift
      const actual = await provider.describeAgent(shop.agentId!);
      checked++;
      issues.push(...diffAgentConfig(shop, expected, actual));
    } catch (e) {
      checked++;
      issues.push({
        shopId: shop.id,
        businessName: shop.businessName,
        kind: "unreadable",
        detail: `couldn't read the live agent: ${(e as Error).message.slice(0, 120)}`,
      });
    }
  }

  return { checked, issues };
}

/** A short, human line for the alert channel. */
export function summarizeDrift(issues: DriftIssue[]): string {
  if (issues.length === 0) return "All live agents match the code.";
  const shops = new Set(issues.map((i) => i.shopId)).size;
  const lines = issues.slice(0, 12).map((i) => `• ${i.businessName}: ${i.detail}`);
  const more = issues.length > 12 ? `\n…and ${issues.length - 12} more` : "";
  return `${issues.length} config drift issue(s) across ${shops} shop(s):\n${lines.join("\n")}${more}`;
}
