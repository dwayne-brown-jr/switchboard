"use server";

import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import { stripe, hasStripe, PRICE_IDS, appUrl, isPaying } from "@/lib/stripe";
import { isPlanId, type PlanId } from "@/lib/plans";
import { completeUserStep } from "@/lib/engine";
import { logAudit } from "@/lib/audit";

async function ownerShopAtSubscribe(userId: string) {
  const shop = await prisma.shop.findFirst({
    where: { ownerId: userId },
    orderBy: { createdAt: "asc" },
    include: { run: true },
  });
  if (!shop || !shop.run) throw new Error("No shop to subscribe.");
  return shop;
}

/**
 * Start Stripe Checkout for a plan. Creates/reuses the platform-side customer
 * (tagged with shopId) and redirects to Stripe. The subscription is confirmed
 * on return (confirmCheckout) and by webhook — nothing is provisioned until the
 * subscription is active/trialing.
 */
export async function startCheckout(planId: string) {
  const user = await requireUser();
  if (!isPlanId(planId)) throw new Error("Unknown plan.");
  const shop = await ownerShopAtSubscribe(user.id);

  if (!hasStripe() || !stripe) throw new Error("Billing is not configured.");
  const price = PRICE_IDS[planId as PlanId];
  if (!price) throw new Error(`No Stripe price configured for the ${planId} plan.`);

  // Reuse or create the platform-side customer, tagged with shopId.
  let customerId = shop.stripeCustomerId;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email,
      name: shop.businessName,
      metadata: { shopId: shop.id },
    });
    customerId = customer.id;
    await prisma.shop.update({ where: { id: shop.id }, data: { stripeCustomerId: customerId } });
  }

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price, quantity: 1 }],
    success_url: `${appUrl}/app/subscribe/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${appUrl}/app/subscribe`,
    subscription_data: { metadata: { shopId: shop.id, plan: planId } },
    metadata: { shopId: shop.id, plan: planId },
    allow_promotion_codes: true,
  });

  if (!session.url) throw new Error("Could not start checkout.");
  redirect(session.url);
}

/**
 * Confirm a returned Checkout session server-side (works locally without a
 * webhook tunnel). Verifies ownership, syncs billing fields, and advances the
 * run past the subscribe gate. The webhook does the same idempotently in prod.
 */
export async function confirmCheckout(sessionId: string) {
  const user = await requireUser();
  const shop = await ownerShopAtSubscribe(user.id);
  if (!hasStripe() || !stripe) throw new Error("Billing is not configured.");

  const session = await stripe.checkout.sessions.retrieve(sessionId, { expand: ["subscription"] });
  if (session.metadata?.shopId !== shop.id) throw new Error("This checkout doesn't belong to your shop.");

  const sub = session.subscription as import("stripe").Stripe.Subscription | null;
  const planId = (session.metadata?.plan as string) || shop.plan || "front_desk";

  await prisma.shop.update({
    where: { id: shop.id },
    data: {
      stripeSubId: sub?.id ?? shop.stripeSubId,
      subStatus: sub?.status ?? "active",
      plan: planId,
    },
  });

  // Guard against racing the Stripe webhook (both complete the subscribe step
  // and kick off provisioning). Only advance if the step isn't already done —
  // otherwise a concurrent pass could double-provision (two numbers/agents).
  if (isPaying(sub?.status ?? "active") && shop.run) {
    const step = await prisma.provisioningStep.findUnique({
      where: { runId_key: { runId: shop.run.id, key: "subscribe" } },
    });
    if (step && step.status !== "done") {
      await logAudit(shop.id, user.id, "subscribe.completed", { plan: planId });
      await completeUserStep(shop.run.id, "subscribe", { plan: planId });
    }
  }
  redirect("/app");
}

/** Open the Stripe customer portal for self-service (change plan, cancel). */
export async function openBillingPortal() {
  const user = await requireUser();
  const shop = await ownerShopAtSubscribe(user.id);
  if (!hasStripe() || !stripe || !shop.stripeCustomerId) throw new Error("Billing is not configured.");
  const portal = await stripe.billingPortal.sessions.create({
    customer: shop.stripeCustomerId,
    return_url: `${appUrl}/app`,
  });
  redirect(portal.url);
}

/**
 * DEV ONLY — simulate a subscription without Stripe, so the full onboarding
 * flow is testable before billing keys exist. Disabled in production and when
 * Stripe is actually configured.
 */
export async function simulateSubscription(planId: string) {
  if (process.env.NODE_ENV === "production" || hasStripe()) {
    throw new Error("Simulation is not available.");
  }
  const user = await requireUser();
  if (!isPlanId(planId)) throw new Error("Unknown plan.");
  const shop = await ownerShopAtSubscribe(user.id);
  await prisma.shop.update({
    where: { id: shop.id },
    data: { subStatus: "active", plan: planId, stripeCustomerId: `dev_${shop.id}`, stripeSubId: `dev_sub_${shop.id}` },
  });
  await logAudit(shop.id, user.id, "subscribe.simulated", { plan: planId });
  await completeUserStep(shop.run!.id, "subscribe", { plan: planId, simulated: true });
  redirect("/app");
}
