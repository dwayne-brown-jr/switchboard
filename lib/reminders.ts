import "server-only";
import { prisma } from "./db";
import { logAudit } from "./audit";
import { notifyOwnerBilling, notifyOwnerOnboardingNudge } from "./notify";
import { reportError } from "./observability";

// Owner reminder emails, run daily from /api/jobs/reminders:
//   1. Dunning — escalating "update your card" reminders while a subscription is
//      past_due (day 1 is sent live on the past_due transition; this adds day 3
//      and day 7). We keep answering throughout — only a full cancellation stops
//      service — so this is pure nudging, not enforcement.
//   2. Abandonment — a one-time nudge to an owner who started onboarding and
//      stalled at a pre-live step (never finished the wizard, never subscribed,
//      never forwarded their calls).
// Both dedupe via distinct AuditLog actions so a daily run never double-sends.

const DAY = 86_400_000;

// Escalation stages, highest last. Each sends at most once per past_due spell.
const DUNNING_STAGES = [
  { day: 3, action: "billing.reminder.d3" },
  { day: 7, action: "billing.reminder.d7" },
];

const ABANDON_DAYS = Number(process.env.ONBOARDING_NUDGE_DAYS ?? 2);
// Pre-live steps worth nudging (a2p is optional/post-live, so it's excluded).
const NUDGE_STEPS = new Set(["wizard", "subscribe", "test_agent", "forwarding"]);

export async function sendDunningReminders(): Promise<{ scanned: number; sent: number }> {
  const shops = await prisma.shop.findMany({
    where: { subStatus: { in: ["past_due", "unpaid"] } },
    select: { id: true, businessName: true, owner: { select: { email: true } } },
  });

  let sent = 0;
  for (const shop of shops) {
    if (!shop.owner?.email) continue;
    // When did this past_due spell start? (latest payment-issue audit entry)
    const issue = await prisma.auditLog.findFirst({
      where: { shopId: shop.id, action: "subscription.payment_issue" },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    });
    if (!issue) continue; // can't stage without a start time — leave it
    const daysPastDue = (Date.now() - issue.createdAt.getTime()) / DAY;

    // Highest stage that's due, sent at most once since the spell began.
    const due = [...DUNNING_STAGES].reverse().find((s) => daysPastDue >= s.day);
    if (!due) continue;
    const already = await prisma.auditLog.findFirst({
      where: { shopId: shop.id, action: due.action, createdAt: { gte: issue.createdAt } },
    });
    if (already) continue;

    try {
      await notifyOwnerBilling(shop.owner.email, shop.businessName, "past_due");
      await logAudit(shop.id, null, due.action, { daysPastDue: Math.round(daysPastDue) });
      sent++;
    } catch (e) {
      await reportError(e, { source: "job", route: "reminders:dunning", shopId: shop.id });
    }
  }
  return { scanned: shops.length, sent };
}

export async function sendAbandonmentNudges(): Promise<{ scanned: number; sent: number }> {
  const runs = await prisma.onboardingRun.findMany({
    where: { status: "waiting_user" },
    include: { steps: true, shop: { select: { id: true, businessName: true, status: true, owner: { select: { email: true } } } } },
  });

  const cutoff = Date.now() - ABANDON_DAYS * DAY;
  let sent = 0;
  for (const run of runs) {
    const step = run.currentStep;
    if (!step || !NUDGE_STEPS.has(step)) continue;
    if (run.shop.status === "live" || run.shop.status === "paused") continue;
    if (!run.shop.owner?.email) continue;

    // Stalled long enough? Use the current step's last update as the clock.
    const cur = run.steps.find((s) => s.key === step);
    if (!cur || cur.updatedAt.getTime() > cutoff) continue;

    // One nudge per run (dedupe on the action since the run started).
    const already = await prisma.auditLog.findFirst({
      where: { shopId: run.shop.id, action: "onboarding.nudge", createdAt: { gte: run.startedAt } },
    });
    if (already) continue;

    try {
      await notifyOwnerOnboardingNudge(run.shop.owner.email, run.shop.businessName, step);
      await logAudit(run.shop.id, null, "onboarding.nudge", { step });
      sent++;
    } catch (e) {
      await reportError(e, { source: "job", route: "reminders:nudge", shopId: run.shop.id });
    }
  }
  return { scanned: runs.length, sent };
}
