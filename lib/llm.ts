import "server-only";
import { complete, extractJson, hasAnthropic, MODEL, QA_MODEL } from "./anthropic";
import { deterministicQa, prettyField } from "./qa-rules";
import { TEMPLATES } from "./templates";
import { verticalDef, DAY_LABELS, type Vertical } from "./verticals";
import { composeGreeting } from "./wizard-defaults";
import {
  wizardSchema,
  configSchema,
  qaResultSchema,
  prefillSchema,
  type WizardData,
  type ShopConfig,
  type QaResult,
  type QaFlag,
  type PrefillResult,
} from "./schemas";

// ===========================================================================
// Design note: reliability is the product. Config assembly, template filling,
// and the QA safety gate all have a DETERMINISTIC backbone that always runs —
// the LLM only *enriches* (website prefill, nicer QA phrasing). The guardrails
// (no exact prices, escalation coverage, required fields) can never be turned
// off by a bad model response.
// ===========================================================================

// ---------------------------------------------------------------------------
// Website prefill — genuine LLM extraction from scraped site text. Best-effort:
// returns {} on any failure so the wizard just skips prefill silently.
// ---------------------------------------------------------------------------
export async function prefillFromWebsite(
  scrapedText: string,
  vertical: Vertical,
): Promise<PrefillResult> {
  const empty: PrefillResult = { services: [], faqs: [], city: "", serviceArea: "" };
  if (!hasAnthropic() || !scrapedText.trim()) return empty;
  const def = verticalDef(vertical);
  const system =
    "You extract structured business facts from a local service company's website text. " +
    "Return ONLY JSON. Never invent prices — only include a price range if it is explicitly stated on the page. " +
    "Keep answers short and factual.";
  const prompt = `This is a ${def.label} business. From the website text below, extract what you can find.
Return JSON exactly like:
{
  "services": [{"service": "Oil change", "priceRange": "", "bookable": true}],
  "faqs": [{"q": "Do you take walk-ins?", "a": "Yes, walk-ins welcome."}],
  "city": "",
  "serviceArea": ""
}
Only include facts actually present in the text. Leave priceRange "" unless a price is explicitly written.

WEBSITE TEXT:
"""
${scrapedText.slice(0, 12000)}
"""`;
  try {
    const raw = await complete({ system, prompt, model: MODEL, maxTokens: 1500 });
    const json = extractJson(raw);
    const parsed = prefillSchema.safeParse(json);
    return parsed.success ? parsed.data : empty;
  } catch {
    return empty;
  }
}

// ---------------------------------------------------------------------------
// generateConfig — assembles the canonical config from wizard data. Structured
// in, structured out: deterministic by design (no round-trip through an LLM).
// Computes `missing` for required fields that block the pipeline.
// scrapedText is accepted for interface fidelity; prefill is handled in-wizard.
// ---------------------------------------------------------------------------
export function generateConfig(
  wizardInput: WizardData,
  clientId: string,
  _scrapedText?: string,
): ShopConfig {
  const wizard = wizardSchema.parse(wizardInput);
  const def = verticalDef(wizard.vertical);
  const vertical = def.id;

  const services = wizard.services.filter((s) => s.service.trim());
  const bookable = services.filter((s) => s.bookable);

  const price_ranges: Record<string, string> = {};
  for (const s of services) {
    if (s.priceRange && s.priceRange.trim()) price_ranges[s.service] = s.priceRange.trim();
  }

  const service_value_map: Record<string, number> = {};
  for (const s of services) {
    service_value_map[s.service] = def.serviceValueMap[s.service] ?? def.avgTicket;
  }

  const alertNumber = wizard.emergencies.alertNumber.trim() || wizard.ownerMobile.trim();
  const serviceArea = wizard.serviceArea.trim() || wizard.city.trim();
  // Greeting always has a sensible auto-composed default, so it never blocks.
  const greeting = wizard.greeting.trim() || composeGreeting(wizard.businessName);

  const missing: string[] = [];
  if (!wizard.businessName.trim()) missing.push("business name");
  if (!wizard.city.trim()) missing.push("city");
  if (!wizard.timezone.trim()) missing.push("time zone");
  if (!wizard.businessNumber.trim()) missing.push("main business phone number");
  if (!alertNumber) missing.push("emergency alert phone number");
  if (bookable.length === 0) missing.push("at least one bookable service");
  if (!hasOpenDay(wizard.hours)) missing.push("business hours");

  const config: ShopConfig = {
    client_id: clientId,
    business_name: wizard.businessName.trim() || null,
    vertical,
    city: wizard.city.trim() || null,
    service_area: serviceArea || null,
    hours: wizard.hours,
    services,
    price_ranges,
    booking_fields: def.bookingFields,
    faqs: wizard.faqs.filter((f) => f.q.trim()),
    hot_job_rules: wizard.emergencies.rules.filter((r) => r.trim()),
    escalation: { alert_number: alertNumber || null },
    avg_ticket: def.avgTicket,
    service_value_map,
    calendar_id: null, // provisioned in Phase 2
    owner_phone: wizard.ownerMobile.trim() || null,
    business_number: wizard.businessNumber.trim() || null,
    agent_number: null, // provisioned in Phase 2
    voice: wizard.voice || "11labs-Marissa",
    greeting,
    missing,
  };

  return configSchema.parse(config);
}

function hasOpenDay(hours: WizardData["hours"]): boolean {
  return Object.values(hours).some((d) => !d.closed && d.open && d.close);
}

// ---------------------------------------------------------------------------
// generatePrompt — fills the vertical template. The deterministic fill is the
// source of truth (guarantees the baked-in safety sections survive verbatim).
// When a key is present we ask the model to lightly polish phrasing, but we
// reject any polish that drops a required section and fall back to the fill.
// ---------------------------------------------------------------------------
export async function generatePrompt(config: ShopConfig): Promise<string> {
  const filled = fillTemplate(config);
  if (!hasAnthropic()) return filled;
  try {
    const system =
      "You lightly polish a phone-receptionist script for readability. You MUST keep every " +
      "section header (ROLE, DISCLOSURE, WHAT YOU KNOW, RULES, BOOKING FLOW, ESCALATION, HANDING OFF TO A PERSON, CLOSING) " +
      "and MUST keep all safety rules and numbers exactly. Do not add or remove rules. Return only the script.";
    const polished = await complete({
      system,
      prompt: `Polish wording only. Keep all facts, numbers, sections, and safety rules identical:\n\n${filled}`,
      model: MODEL,
      maxTokens: 2000,
    });
    return hasAllSections(polished) ? polished.trim() : filled;
  } catch {
    return filled;
  }
}

const REQUIRED_SECTIONS = ["ROLE", "DISCLOSURE", "WHAT YOU KNOW", "RULES", "BOOKING FLOW", "ESCALATION", "HANDING OFF TO A PERSON", "CLOSING"];

function hasAllSections(text: string): boolean {
  return REQUIRED_SECTIONS.every((s) => text.includes(s));
}

export function fillTemplate(config: ShopConfig): string {
  const template = TEMPLATES[config.vertical as Vertical];
  const hoursText = Object.entries(config.hours)
    .map(([day, h]) => {
      const label = DAY_LABELS[day as keyof typeof DAY_LABELS];
      return h.closed || !h.open ? `- ${label}: Closed` : `- ${label}: ${h.open}–${h.close}`;
    })
    .join("\n");
  const servicesText = config.services
    .map((s) => {
      const price = config.price_ranges[s.service];
      const book = s.bookable ? "" : " (info only, not bookable)";
      return `- ${s.service}${price ? ` (typically ${price})` : ""}${book}`;
    })
    .join("\n");
  const faqsText =
    config.faqs.filter((f) => f.a.trim()).map((f) => `- Q: ${f.q}\n  A: ${f.a}`).join("\n") ||
    "- (No specific FAQs provided — offer to take a message for anything you're unsure about.)";
  const hotJobsText =
    config.hot_job_rules.map((r) => `- ${r}`).join("\n") || "- Any situation the caller describes as an emergency.";
  const bookingFieldsText = config.booking_fields.map(prettyField).join(", ");

  const filled = template
    .replaceAll("{BUSINESS_NAME}", config.business_name ?? "the shop")
    .replaceAll("{CITY}", config.city ?? "the local area")
    .replaceAll("{SERVICE_AREA}", config.service_area ?? config.city ?? "the local area")
    .replaceAll("{GREETING}", config.greeting ?? "")
    .replaceAll("{HOURS}", hoursText)
    .replaceAll("{SERVICES}", servicesText || "- (Services to be confirmed.)")
    .replaceAll("{FAQS}", faqsText)
    .replaceAll("{HOT_JOBS}", hotJobsText)
    .replaceAll("{BOOKING_FIELDS}", bookingFieldsText)
    .replaceAll("{ESCALATION_PHONE}", config.escalation.alert_number ?? "the shop owner");
  return filled + HANDOFF_SECTION;
}

// Baked handoff guardrail (all verticals). Keeps the agent handling routine
// calls itself and only reaching a human when it truly can't — after capturing
// the caller's details so nothing is lost if the transfer isn't answered.
const HANDOFF_SECTION = `

HANDING OFF TO A PERSON
Handle the call yourself whenever you reasonably can — booking, listed prices/hours, common questions, taking details. Reach a live person only when: the caller needs something you genuinely cannot do, the caller clearly asks to speak to a person, or it's a genuine emergency (see ESCALATION).
When you do:
1. First collect their name, a callback number, and a one-line reason — but if it's a true emergency and seconds matter, don't hold them up for details.
2. For an emergency, alert the team right away, then offer to connect the caller to a person now: "I can get you straight through to the team — want me to connect you?"
3. Tell them you're connecting them and use the transfer option to reach the team. If no one picks up, reassure them their details are saved, the team has already been alerted, and someone will call right back — never leave them without a clear next step.
Do NOT hand off for anything you can handle (scheduling, hours, prices in range, common questions).`;

// ---------------------------------------------------------------------------
// qaReview — the safety gate. Deterministic rule checks ALWAYS run and can
// force a no_go; the LLM may add extra advisory flags but can never override a
// critical deterministic finding.
// ---------------------------------------------------------------------------
export async function qaReview(prompt: string, config: ShopConfig): Promise<QaResult> {
  // Deterministic backbone — the only thing that can force a no_go.
  const { critical, flags } = deterministicQa(prompt, config);

  let verdict: QaResult["verdict"] = critical ? "no_go" : "go";

  // LLM enrichment (advisory only). Never allowed to clear a critical no_go.
  if (hasAnthropic()) {
    try {
      const extra = await llmQaFlags(prompt, config);
      for (const f of extra) if (!flags.some((x) => x.risk === f.risk)) flags.push(f);
    } catch {
      /* deterministic result stands */
    }
  }

  return qaResultSchema.parse({ verdict, flags });
}

async function llmQaFlags(prompt: string, config: ShopConfig): Promise<QaFlag[]> {
  const system =
    "You are a quality reviewer for an automated phone receptionist used by a local service business. " +
    "Find realistic problems that could embarrass the owner: missing FAQ answers, prices that are too precise, " +
    "emergency situations that aren't covered, booking details not collected, or unclear hours/timezone. " +
    "Return ONLY JSON: {\"flags\":[{\"risk\":\"plain owner-facing wording\",\"fix\":\"what to change\"}]}. " +
    "Keep wording friendly and non-technical. If nothing is wrong, return an empty array.";
  const raw = await complete({
    system,
    prompt: `CONFIG:\n${JSON.stringify(configForReview(config))}\n\nSCRIPT:\n${prompt}`,
    model: QA_MODEL,
    maxTokens: 1200,
  });
  const json = extractJson<{ flags?: QaFlag[] }>(raw);
  const flags = json?.flags ?? [];
  return flags.filter((f) => f && typeof f.risk === "string" && typeof f.fix === "string").slice(0, 6);
}

function configForReview(config: ShopConfig) {
  // Strip nothing sensitive (no secrets here) but keep it compact.
  return {
    business_name: config.business_name,
    vertical: config.vertical,
    city: config.city,
    hours: config.hours,
    services: config.services,
    price_ranges: config.price_ranges,
    booking_fields: config.booking_fields,
    faqs: config.faqs,
    hot_job_rules: config.hot_job_rules,
    escalation: config.escalation,
  };
}
