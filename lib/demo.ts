// Public landing-page demo: a REAL Retell web call. Uses one pre-provisioned
// demo agent per type, personalized per call via Retell dynamic variables
// (business/city/service). This file is intentionally dependency-free (no
// server-only, no prisma) so the client component and the API route can both
// import it.

export type DemoTypeId = "auto" | "auto_appearance" | "hvac";

export interface DemoType {
  id: DemoTypeId;
  label: string;
  blurb: string;
  /** Placeholders shown in the form; also the fallback if the visitor types nothing. */
  defaults: { business: string; city: string; service: string };
  serviceLabel: string;
}

export const DEMO_TYPES: DemoType[] = [
  {
    id: "auto",
    label: "Auto repair",
    blurb: "A mechanical shop booking a diagnostic - watch it refuse to quote an exact price.",
    defaults: { business: "Riverside Auto Care", city: "Austin, TX", service: "check-engine diagnostic" },
    serviceLabel: "Most-booked service",
  },
  {
    id: "auto_appearance",
    label: "Auto detailing",
    blurb: "A detailing shop quoting a ceramic package - pricing keyed to the vehicle.",
    defaults: { business: "Gloss Factory Detailing", city: "Miami, FL", service: "ceramic coating" },
    serviceLabel: "Most-booked service",
  },
  {
    id: "hvac",
    label: "Heating & Air",
    blurb: "A no-heat emergency - watch it flag the urgent call and alert the owner.",
    defaults: { business: "Summit Heating & Air", city: "Denver, CO", service: "furnace repair" },
    serviceLabel: "Most-booked service",
  },
];

export function isDemoType(v: string): v is DemoTypeId {
  return DEMO_TYPES.some((t) => t.id === v);
}

export function demoType(id: string): DemoType {
  return DEMO_TYPES.find((t) => t.id === id) ?? DEMO_TYPES[0];
}

export interface DemoVars {
  business: string;
  city: string;
  service: string;
}

/** Fill blanks with the type's defaults and clamp lengths (defense for the
 *  public route + tidy display in the sim). */
export function resolveVars(typeId: string, raw: Partial<DemoVars> | undefined): DemoVars {
  const d = demoType(typeId).defaults;
  const clean = (s: string | undefined, fallback: string) => {
    // Strip angle brackets + control chars (markup/prompt safety). Keep normal
    // business-name characters: letters, digits, spaces, comma, period, - & '.
    const v = (s ?? "").replace(/[<>]/g, "").replace(/[^\x20-\x7E]/g, "").trim().slice(0, 60);
    return v || fallback;
  };
  return {
    business: clean(raw?.business, d.business),
    city: clean(raw?.city, d.city),
    service: clean(raw?.service, d.service),
  };
}

/** A single transcript turn, rendered live from the Retell web call. */
export type Line = { who: "agent" | "caller"; text: string };

// --- Real Retell agent prompt (used once, at provisioning) -------------------
// Static prompt referencing Retell dynamic variables ({{business_name}} etc.)
// injected per web call. Keeps the same guardrails as production agents.

export function demoAgentGreeting(): string {
  return `Thanks for calling {{business_name}}! This is our virtual assistant. How can I help you today?`;
}

export function demoAgentPrompt(typeId: DemoTypeId): string {
  const common = `You are the friendly phone receptionist for {{business_name}}, a local business in {{city}}. You are warm, efficient, and never pushy. This is a live demo, so keep the conversation natural and fairly brief.

DISCLOSURE: If asked whether you are a person, say honestly that you're {{business_name}}'s automated assistant.

RULES
- Never quote an exact price over the phone. Give a rough range only if natural, framed as "typically" or "starting around," and say the team confirms after a look.
- Collect the caller's name and callback number before "booking".
- You can pretend to offer and confirm an appointment time (this is a demo - no real calendar).
- Stay in scope: represent {{business_name}} only.`;

  if (typeId === "auto") {
    return `${common}

You are an AUTO REPAIR shop. Their most-booked service is {{primary_service}}. Always confirm the vehicle's year, make, and model and read it back. Never diagnose for certain over the phone - take symptoms and let the tech confirm.`;
  }
  if (typeId === "auto_appearance") {
    return `${common}

You are an AUTO DETAILING & CUSTOMIZATION shop (detailing, ceramic, tint, wraps). Their most-requested service is {{primary_service}}. Pricing depends on the vehicle's size and condition - never promise an exact number; get them scheduled for a look instead.`;
  }
  return `${common}

You are a HEATING & AIR (HVAC) company. Their most-common call is {{primary_service}}. If the caller describes no heat/cooling in extreme weather, a gas smell, or a vulnerable occupant, treat it as URGENT: reassure them, take their details, and tell them you're alerting the on-call tech immediately.`;
}

/** Env var holding the provisioned demo agent id for a type. */
export function demoAgentEnvKey(typeId: DemoTypeId): string {
  return `DEMO_AGENT_${typeId.toUpperCase()}`;
}
