import "server-only";
import Stripe from "stripe";
import type { PlanId } from "./plans";

const key = process.env.STRIPE_SECRET_KEY;

// Single platform Stripe account. Null when unconfigured (dev) — callers guard
// with hasStripe() and fall back to the dev "simulate subscription" path.
export const stripe = key ? new Stripe(key) : null;

export function hasStripe(): boolean {
  return stripe !== null;
}

// Env-configured Price IDs, one per plan. Operator creates 3 Products in Stripe
// (Catch $49 / Front Desk $149 / Growth $299) and pastes their price IDs here.
export const PRICE_IDS: Record<PlanId, string | undefined> = {
  catch: process.env.STRIPE_PRICE_CATCH,
  front_desk: process.env.STRIPE_PRICE_FRONT_DESK,
  growth: process.env.STRIPE_PRICE_GROWTH,
};

/** A subscription counts as "paying" (unlocks provisioning) when active/trialing. */
export function isPaying(subStatus: string | null | undefined): boolean {
  return subStatus === "active" || subStatus === "trialing";
}

export const appUrl = process.env.APP_URL ?? "http://localhost:3000";
