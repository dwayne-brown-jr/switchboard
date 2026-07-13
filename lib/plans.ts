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

// One plan for launch. The product gives every shop the full receptionist, so
// we sell exactly that — one honest, flat price. (Tiering can come later once
// there are real customers and a clear feature to gate.) The Stripe price used
// is STRIPE_PRICE_FRONT_DESK; change `price` here + that env together to reprice.
export const PLANS: Plan[] = [
  {
    id: "front_desk",
    name: "Switchboard",
    price: 149,
    tagline: "Your AI receptionist, always on",
    popular: true,
    features: [
      "Answers every call, 24/7",
      "Books appointments on your calendar",
      "Answers your customers' common questions",
      "Flags emergencies & texts you instantly",
      "Hands off to you when a call needs a human",
      "Cancel anytime",
    ],
  },
];

export function plan(id: string): Plan | undefined {
  return PLANS.find((p) => p.id === id);
}

export function isPlanId(id: string): id is PlanId {
  return PLANS.some((p) => p.id === id);
}
