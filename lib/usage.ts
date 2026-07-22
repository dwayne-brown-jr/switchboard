import "server-only";
import type { Shop } from "@prisma/client";
import { prisma } from "./db";
import { plan, nextTier, type Plan } from "./plans";
import { usageMeter } from "./usage-meter";
import { stripe, PRICE_IDS, isPaying } from "./stripe";
import { logAudit } from "./audit";
import { notifyAdmins } from "./notify";
import { sendEmail } from "./email";
import { reportError } from "./observability";

// ---------------------------------------------------------------------------
// Usage / margin protection. A flat $149 with unlimited minutes goes underwater
// above ~15 calls/day (Retell COGS ~$0.09–0.14/min). Each plan now carries
// `includedMinutes`; when a live shop consistently exceeds them we move it up
// the tier ladder (lib/plans TIERS) so volume can't erase the margin.
//
// Auto-executing a billing change is only done when USAGE_AUTOBUMP=on. Off (the
// default), we just alert the operator to bump manually from Stripe — so the
// mechanism ships and runs now, but no real customer's price changes on its own
// until it's been verified against a live subscription. Detection is always on.
// ---------------------------------------------------------------------------

const WINDOW_DAYS = 30; // rolling ~= a monthly billing cycle
const REALERT_HOURS = 72; // don't re-nag the operator about the same overage daily
const autoBumpEnabled = () => (process.env.USAGE_AUTOBUMP ?? "").toLowerCase() === "on";

/** Voice minutes a shop has used in the trailing window (rounded). */
export async function minutesUsed(shopId: string, days = WINDOW_DAYS): Promise<number> {
  const since = new Date(Date.now() - days * 86_400_000);
  const rows = await prisma.callRecord.findMany({
    where: { shopId, timestamp: { gte: since } },
    select: { durationSec: true },
  });
  const sec = rows.reduce((s, r) => s + (r.durationSec || 0), 0);
  return Math.round(sec / 60);
}

export interface UsageStatus {
  used: number;
  included: number;
  over: boolean;
  planId: string;
  next?: Plan;
}

/** Where a shop stands against its plan's included minutes. */
export async function usageStatus(shop: Pick<Shop, "id" | "plan">): Promise<UsageStatus> {
  const current = plan(shop.plan ?? "front_desk") ?? plan("front_desk")!;
  const used = await minutesUsed(shop.id);
  return {
    used,
    included: current.includedMinutes,
    over: used > current.includedMinutes,
    planId: current.id,
    next: nextTier(current.id),
  };
}

export interface UsageSweepResult {
  scanned: number;
  over: number;
  bumped: number;
  alerted: number;
  /** Owners warned that they're nearing their included minutes. */
  warned: number;
}

/** How long before the same shop can be warned again.
 *
 *  Once a cycle would be too little — a shop that sits at 85% for three weeks
 *  should hear again before it crosses. Daily would be noise. Weekly is a
 *  useful reminder that still respects the inbox. */
const APPROACHING_REWARN_DAYS = 7;

/** Scan live, paying shops and act on those over their included minutes:
 *  auto-bump to the next tier when enabled, otherwise alert the operator.
 *  Best-effort and idempotent; one shop's failure never aborts the sweep. */
export async function sweepUsageOverages(): Promise<UsageSweepResult> {
  const shops = await prisma.shop.findMany({
    where: { status: "live" },
    select: { id: true, plan: true, businessName: true, subStatus: true, stripeCustomerId: true, ownerId: true, owner: { select: { email: true } } },
  });

  const res: UsageSweepResult = { scanned: shops.length, over: 0, bumped: 0, alerted: 0, warned: 0 };

  for (const shop of shops) {
    try {
      if (!isPaying(shop.subStatus)) continue;
      const status = await usageStatus(shop);

      // Not over yet — but say something if they're close. The pricing page
      // promises "we'd tell you before we do", and the dashboard meter alone
      // only keeps that promise for an owner who happens to log in and look.
      // This is the half that reaches the owner who doesn't.
      if (!status.over) {
        if (usageMeter(status.used, status.included).tone === "approaching") {
          if (await warnApproaching(shop, status)) res.warned++;
        }
        continue;
      }
      res.over++;

      if (autoBumpEnabled() && status.next) {
        const ok = await bumpToTier(shop, status.next);
        if (ok) {
          res.bumped++;
          continue;
        }
        // fall through to alert if the Stripe swap couldn't complete
      }
      const alerted = await alertOverage(shop, status);
      if (alerted) res.alerted++;
    } catch (e) {
      await reportError(e, { source: "job", route: "usage-sweep", shopId: shop.id });
    }
  }
  return res;
}

type SweepShop = { id: string; plan: string | null; businessName: string; stripeCustomerId: string | null; ownerId: string; owner: { email: string } | null };

/** Swap the shop's live Stripe subscription onto the target tier's price and
 *  record the new plan. Returns false (caller falls back to alerting) if Stripe
 *  isn't configured or the subscription/price can't be resolved. */
async function bumpToTier(shop: SweepShop, target: Plan): Promise<boolean> {
  if (shop.plan === target.id) return true; // already there — idempotent
  const priceId = PRICE_IDS[target.id];
  if (!stripe || !shop.stripeCustomerId || !priceId) return false;

  const subs = await stripe.subscriptions.list({ customer: shop.stripeCustomerId, status: "all", limit: 1 });
  const sub = subs.data.find((s) => isPaying(s.status)) ?? subs.data[0];
  const item = sub?.items.data[0];
  if (!sub || !item) return false;

  await stripe.subscriptions.update(sub.id, {
    items: [{ id: item.id, price: priceId }],
    proration_behavior: "create_prorations",
  });
  await prisma.shop.update({ where: { id: shop.id }, data: { plan: target.id } });
  await logAudit(shop.id, null, "usage.autobump", { to: target.id, price: target.price });

  if (shop.owner?.email) {
    const line =
      `Good problem to have — ${shop.businessName} is handling enough calls that we've moved you to ${target.name} ` +
      `($${target.price}/mo, ${target.includedMinutes.toLocaleString()} minutes included). Nothing changes about how your ` +
      `receptionist works; this just keeps your minutes covered. Questions? Just reply.`;
    await sendEmail({
      to: shop.owner.email,
      subject: `${shop.businessName}: your plan scaled up with your call volume`,
      text: line,
      html: `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#0f172a;font-size:15px;line-height:1.6">${line}</div>`,
    }).catch((e) => console.error("autobump owner email failed", e));
  }
  await notifyAdmins("Usage auto-bump", `${shop.businessName} (${shop.id}) auto-scaled ${shop.plan} → ${target.id}.`).catch(() => {});
  return true;
}

/** Tell the OWNER they're nearing their included minutes, before anything
 *  changes on their bill.
 *
 *  This is the sentence on the pricing page — "we'd shift you to our higher
 *  tier and tell you before we do" — actually being kept. The dashboard meter
 *  shows the same thing, but only to an owner who logs in; a shop owner under a
 *  truck for three weeks needs it to come to them.
 *
 *  The "approaching" test lives in usageMeter() and is called by the sweep, not
 *  duplicated here, so the email and the dashboard can never disagree about
 *  what counts as close.
 *
 *  Deduped through the FailureEvent feed, the same ledger alertOverage uses.
 *  It's a notification rather than a failure, hence level "warn" — the
 *  error-feed check only alerts on level "error", so this can't page anyone. */
async function warnApproaching(shop: SweepShop, status: UsageStatus): Promise<boolean> {
  if (!shop.owner?.email) return false;

  const since = new Date(Date.now() - APPROACHING_REWARN_DAYS * 86_400_000);
  const recent = await prisma.failureEvent.findFirst({
    where: { route: "usage:approaching", shopId: shop.id, createdAt: { gte: since } },
  });
  if (recent) return false;

  const remaining = Math.max(0, status.included - status.used);
  const next = status.next
    ? `If you do go past it, we'll move you to ${status.next.name} ($${status.next.price}/mo, ` +
      `${status.next.includedMinutes.toLocaleString()} minutes) — there's nothing for you to pick, and you'll ` +
      `never be charged an overage fee.`
    : `If you do go past it, we'll get in touch to price your volume with you directly rather than let a bill ` +
      `surprise you.`;

  const line =
    `Heads up — ${shop.businessName} has used ${status.used.toLocaleString()} of the ` +
    `${status.included.toLocaleString()} talk-minutes included on your plan this cycle, so there are about ` +
    `${remaining.toLocaleString()} left. Nothing has changed and nothing is wrong; this is just so it isn't a ` +
    `surprise. ${next} You can see the running total any time on your dashboard.`;

  await sendEmail({
    to: shop.owner.email,
    subject: `${shop.businessName}: you're nearing your included minutes`,
    text: line,
    html: `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#0f172a;font-size:15px;line-height:1.6">${line}</div>`,
  }).catch((e) => console.error("approaching-minutes owner email failed", e));

  // Written last so a failed send doesn't silently consume the one warning
  // they were going to get.
  await reportError(
    new Error(`Usage approaching plan limit: ${shop.businessName} (${shop.id}) ${status.used}/${status.included} min`),
    { source: "job", route: "usage:approaching", shopId: shop.id, level: "warn" },
  );
  return true;
}

/** Alert the operator that a shop is over its minutes (deduped via the
 *  FailureEvent feed so we don't page on every daily sweep). */
async function alertOverage(shop: SweepShop, status: UsageStatus): Promise<boolean> {
  const since = new Date(Date.now() - REALERT_HOURS * 3_600_000);
  const recent = await prisma.failureEvent.findFirst({ where: { route: "usage:overage", shopId: shop.id, createdAt: { gte: since } } });
  if (recent) return false;

  const target = status.next ? ` — bump to ${status.next.name} ($${status.next.price}/mo)` : " — already at top tier; consider a custom price";
  const msg = `${shop.businessName} (${shop.id}) used ${status.used} min vs ${status.included} included on ${status.planId}${target}.`;
  // reportError writes the FailureEvent (our dedupe ledger) + fans to Slack/Sentry.
  await reportError(new Error(`Usage over plan: ${msg}`), { source: "job", route: "usage:overage", shopId: shop.id, level: "warn" });
  await notifyAdmins("Shop over plan minutes", msg).catch(() => {});
  return true;
}
