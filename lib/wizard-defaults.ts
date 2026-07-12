import { VERTICAL_DEFS, DEFAULT_HOURS, DEFAULT_VOICE, type Vertical } from "./verticals";
import type { WizardData } from "./schemas";

/** A fresh wizard payload seeded from a vertical's starter pack. */
export function defaultWizardData(vertical: Vertical = "auto"): WizardData {
  const def = VERTICAL_DEFS[vertical];
  return {
    businessName: "",
    vertical,
    city: "",
    timezone: "",
    websiteUrl: "",
    businessNumber: "",
    ownerMobile: "",
    serviceArea: "",
    services: def.services.map((s) => ({ service: s.service, priceRange: s.priceRange ?? "", bookable: s.bookable })),
    hours: structuredCloneHours(),
    faqs: def.faqs.map((f) => ({ ...f })),
    emergencies: { rules: [...def.hotJobRules], alertNumber: "" },
    voice: DEFAULT_VOICE,
    greeting: "",
    step: 0,
  };
}

/** Re-seed the vertical-specific lists (services/faqs/emergencies) when the
 *  owner changes vertical early in the wizard, keeping everything else. */
export function reseedForVertical(data: WizardData, vertical: Vertical): WizardData {
  const def = VERTICAL_DEFS[vertical];
  return {
    ...data,
    vertical,
    services: def.services.map((s) => ({ service: s.service, priceRange: s.priceRange ?? "", bookable: s.bookable })),
    faqs: def.faqs.map((f) => ({ ...f })),
    emergencies: { rules: [...def.hotJobRules], alertNumber: data.emergencies.alertNumber },
  };
}

export function composeGreeting(businessName: string): string {
  const name = businessName.trim() || "our shop";
  return `Thanks for calling ${name}! This is our virtual assistant. How can I help you today?`;
}

function structuredCloneHours() {
  return JSON.parse(JSON.stringify(DEFAULT_HOURS)) as WizardData["hours"];
}
