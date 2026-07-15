// Client-safe plan definitions (display only). The real Stripe Price IDs live
// in env (lib/stripe.ts) — these numbers are just what we show the owner.
export type PlanId = "catch" | "front_desk" | "growth";

export interface Plan {
  id: PlanId;
  name: string;
  price: number; // monthly USD, display only
  /** Voice minutes included in the monthly price. Above this we auto-scale the
   *  shop to the next tier (see lib/usage.ts) so a busy month can't run the plan
   *  underwater. This is the unit that protects gross margin. */
  includedMinutes: number;
  tagline: string;
  features: string[];
  popular?: boolean;
}

// One MARKETED plan for launch — "$149, 500 minutes included." Busier shops are
// auto-scaled to the higher `growth` tier rather than silently eroding margin
// (Retell COGS ~$0.09–0.14/min means an uncapped flat $149 goes negative above
// ~15 calls/day). The Stripe prices used are STRIPE_PRICE_FRONT_DESK / _GROWTH;
// change `price` here + that env together to reprice.
const FRONT_DESK: Plan = {
  id: "front_desk",
  name: "Switchboard",
  price: 149,
  includedMinutes: 500,
  tagline: "Your AI receptionist, always on",
  popular: true,
  features: [
    "Answers every call, 24/7",
    "500 talk-minutes included (~5–6 calls/day)",
    "Books appointments on your calendar",
    "Answers your customers' common questions",
    "Flags emergencies & texts you instantly",
    "Hands off to you when a call needs a human",
    "Cancel anytime",
  ],
};

// Auto-scale target for high-volume shops. Not shown as a separate card on the
// marketing page — a shop is moved here automatically when it consistently
// exceeds the included minutes, and told when it happens.
const GROWTH: Plan = {
  id: "growth",
  name: "Switchboard Growth",
  price: 299, // matches the live STRIPE_PRICE_GROWTH ($299/mo)
  includedMinutes: 1500,
  tagline: "For high-volume shops",
  features: [
    "Everything in Switchboard",
    "1,500 talk-minutes included (~15 calls/day)",
    "Automatic — we move you here only when your call volume needs it",
  ],
};

// Marketed plans (what the pricing page renders). One honest price.
export const PLANS: Plan[] = [FRONT_DESK];

// Full billing ladder, ascending by included minutes — the auto-bump path.
export const TIERS: Plan[] = [FRONT_DESK, GROWTH];

export function plan(id: string): Plan | undefined {
  return TIERS.find((p) => p.id === id);
}

export function isPlanId(id: string): id is PlanId {
  return TIERS.some((p) => p.id === id);
}

/** The next tier up from `id`, or undefined if already at the top of the ladder. */
export function nextTier(id: string): Plan | undefined {
  const idx = TIERS.findIndex((p) => p.id === id);
  return idx >= 0 ? TIERS[idx + 1] : undefined;
}
