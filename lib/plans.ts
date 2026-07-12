// Client-safe plan definitions (display only). The real Stripe Price IDs live
// in env (lib/stripe.ts) — these numbers are just what we show the owner.
export type PlanId = "catch" | "front_desk" | "growth";

export interface Plan {
  id: PlanId;
  name: string;
  price: number; // monthly USD, display only
  tagline: string;
  features: string[];
  popular?: boolean;
}

export const PLANS: Plan[] = [
  {
    id: "catch",
    name: "Catch",
    price: 49,
    tagline: "Never miss a call again",
    features: [
      "Answers every call, 24/7",
      "Takes messages & texts you",
      "Flags emergencies instantly",
    ],
  },
  {
    id: "front_desk",
    name: "Front Desk",
    price: 149,
    tagline: "Books jobs while you work",
    popular: true,
    features: [
      "Everything in Catch",
      "Books appointments on your calendar",
      "Answers your common questions",
      "Missed-call text-back",
    ],
  },
  {
    id: "growth",
    name: "Growth",
    price: 299,
    tagline: "Your busiest front desk",
    features: [
      "Everything in Front Desk",
      "Priority support",
      "Weekly performance reports",
      "Higher call volume",
    ],
  },
];

export function plan(id: string): Plan | undefined {
  return PLANS.find((p) => p.id === id);
}

export function isPlanId(id: string): id is PlanId {
  return PLANS.some((p) => p.id === id);
}
