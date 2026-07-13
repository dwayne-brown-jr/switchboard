import type Stripe from "stripe";
import { prisma } from "./db";
import { completeUserStep } from "./engine";
import { isPaying } from "./stripe";
import { cancelShop, resumeShopAgent } from "./lifecycle";
import { reportError } from "./observability";
import { logAudit } from "./audit";
import { notifyOwnerBilling } from "./notify";

// Shared subscription-sync logic used by BOTH the checkout return handler and
// the Stripe webhook, so they stay consistent and idempotent.

/** Find the shop a Stripe object belongs to (via metadata.shopId or customer). */
async function shopForSub(sub: Stripe.Subscription) {
  const shopId = (sub.metadata?.shopId as string) || undefined;
  if (shopId) return prisma.shop.findUnique({ where: { id: shopId }, include: { run: true, owner: true } });
  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
  return prisma.shop.findFirst({ where: { stripeCustomerId: customerId }, include: { run: true, owner: true } });
}

/** Sync a subscription's status onto the shop and drive lifecycle transitions. */
export async function syncSubscription(sub: Stripe.Subscription, planHint?: string) {
  const shop = await shopForSub(sub);
  if (!shop) return;

  const plan = planHint || (sub.metadata?.plan as string) || shop.plan || null;
  await prisma.shop.update({
    where: { id: shop.id },
    data: { stripeSubId: sub.id, subStatus: sub.status, plan: plan ?? undefined },
  });

  // Newly paying → advance past the subscribe gate (idempotent; only if pending).
  if (isPaying(sub.status) && shop.run) {
    const step = await prisma.provisioningStep.findUnique({
      where: { runId_key: { runId: shop.run.id, key: "subscribe" } },
    });
    if (step && step.status !== "done") {
      await logAudit(shop.id, null, "subscribe.completed", { plan, via: "stripe" });
      await completeUserStep(shop.run.id, "subscribe", { plan });
    }
  }

  // Resubscribed after a cancellation (shop.status is the pre-update value).
  if (isPaying(sub.status) && shop.status === "canceled") {
    if (shop.twilioNumberSid) {
      // Number still held (within grace) → bring the agent back.
      await logAudit(shop.id, null, "subscription.reactivated", {});
      await resumeShopAgent(shop.id);
    } else {
      // Number already reclaimed past grace — needs re-provisioning by an admin.
      await reportError(new Error(`Shop ${shop.id} resubscribed after its number was reclaimed — needs re-provisioning`), {
        source: "webhook",
        route: "billing:resubscribe",
        shopId: shop.id,
        level: "warn",
      });
    }
  }

  // Payment problem (dunning) → tell the owner to fix their card. We do NOT pause
  // yet — Stripe's retries + past_due window are the grace period. Only a full
  // cancellation stops the service.
  if ((sub.status === "past_due" || sub.status === "unpaid") && shop.subStatus !== sub.status) {
    await logAudit(shop.id, null, "subscription.payment_issue", { status: sub.status });
    if (shop.owner?.email) await notifyOwnerBilling(shop.owner.email, shop.businessName, "past_due");
  }

  // Canceled → stop answering (cancelShop unbinds the number + marks the shop
  // "canceled"), notify the owner, and let the grace-window reclaim cron release
  // the number later if they don't resubscribe.
  if (sub.status === "canceled") {
    await logAudit(shop.id, null, "subscription.canceled", {});
    await cancelShop(shop.id, "subscription canceled");
    if (shop.owner?.email) await notifyOwnerBilling(shop.owner.email, shop.businessName, "canceled");
  }
}

export async function handleCheckoutCompleted(session: Stripe.Checkout.Session, stripe: Stripe) {
  const shopId = session.metadata?.shopId;
  if (!shopId) return;
  const subId = typeof session.subscription === "string" ? session.subscription : session.subscription?.id;
  if (!subId) return;
  const sub = await stripe.subscriptions.retrieve(subId);
  await syncSubscription(sub, session.metadata?.plan);
}
