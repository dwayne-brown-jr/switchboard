import "server-only";
import { prisma } from "./db";
import { advanceRun } from "./engine";
import { syncSubscription } from "./billing-sync";
import { stripe, isPaying } from "./stripe";
import { reportError } from "./observability";
import { notifyAdmins } from "./notify";

// ---------------------------------------------------------------------------
// Onboarding self-healing sweep. advanceRun is only ever called *reactively* —
// a completion action, or the Stripe webhook. If one of those signals is lost
// (a webhook never delivered, an auto pass crashed mid-run on a serverless
// timeout), a run can sit forever with nobody watching. This sweep runs on a
// schedule (QStash cron → /api/jobs/onboarding-sweep) and:
//   1. Reconciles subscribe-stalled runs against Stripe (the missed-webhook case).
//   2. Re-drives in_progress runs (idempotent — resumes a crashed auto pass).
//   3. Alerts admins about runs genuinely stuck (no progress in N hours), deduped
//      so a single stuck run doesn't page on every sweep.
// Everything here is best-effort and idempotent; a failure on one run is captured
// and never aborts the sweep.
// ---------------------------------------------------------------------------

const STUCK_HOURS = Number(process.env.ONBOARDING_STUCK_HOURS ?? 72);
const REALERT_HOURS = 24; // don't re-page the same stuck run more than once a day

export interface SweepResult {
  scanned: number;
  reconciled: number;
  readvanced: number;
  alerted: number;
}

export async function sweepStalledRuns(): Promise<SweepResult> {
  const runs = await prisma.onboardingRun.findMany({
    where: { status: { in: ["in_progress", "waiting_user"] } },
    include: { steps: true, shop: true },
  });

  const res: SweepResult = { scanned: runs.length, reconciled: 0, readvanced: 0, alerted: 0 };

  for (const run of runs) {
    // 1. Missed-webhook reconcile: the run is parked before the subscribe gate
    //    but the shop may actually have paid (checkout webhook AND return both
    //    lost). Ask Stripe directly and sync if so — syncSubscription completes
    //    the 'subscribe' step and advances the run.
    const subStep = run.steps.find((s) => s.key === "subscribe");
    const stalledOnSubscribe = subStep && subStep.status !== "done";
    if (stalledOnSubscribe && stripe && run.shop.stripeCustomerId) {
      try {
        const subs = await stripe.subscriptions.list({ customer: run.shop.stripeCustomerId, status: "all", limit: 1 });
        const sub = subs.data[0];
        if (sub && isPaying(sub.status)) {
          await syncSubscription(sub);
          res.reconciled++;
          continue; // fixed — don't also alert on this run
        }
      } catch (e) {
        await reportError(e, { source: "job", route: "sweep:stripe-reconcile", shopId: run.shop.id });
      }
    }

    // 2. Resume a crashed/timed-out auto pass. advanceRun is idempotent and a
    //    no-op when the head is a user step, so this is always safe to call.
    if (run.status === "in_progress") {
      try {
        await advanceRun(run.id);
        res.readvanced++;
      } catch (e) {
        await reportError(e, { source: "job", route: "sweep:advance", shopId: run.shop.id });
      }
    }

    // 3. Genuinely stuck → surface to admins (deduped). A shop that's already
    //    live/paused isn't a stalled onboarding — its run may just linger on the
    //    optional trailing a2p (texting) step, which never blocks being live.
    if (run.shop.status === "live" || run.shop.status === "paused") continue;

    // "Progress" is the newest step update; startedAt is the floor for a run
    // whose steps never moved.
    const lastProgress = run.steps.reduce(
      (max, s) => (s.updatedAt > max ? s.updatedAt : max),
      run.startedAt,
    );
    const hoursStuck = (Date.now() - lastProgress.getTime()) / 3_600_000;
    if (hoursStuck >= STUCK_HOURS) {
      const paged = await alertStuck(run.shop.id, run.shop.businessName, run.currentStep, hoursStuck);
      if (paged) res.alerted++;
    }
  }

  return res;
}

/** Page admins about a stuck run at most once per REALERT_HOURS, using the
 *  FailureEvent feed itself as the dedupe ledger (route "sweep:stuck"). */
async function alertStuck(
  shopId: string,
  businessName: string,
  step: string | null,
  hoursStuck: number,
): Promise<boolean> {
  const since = new Date(Date.now() - REALERT_HOURS * 3_600_000);
  const recent = await prisma.failureEvent.findFirst({
    where: { route: "sweep:stuck", shopId, createdAt: { gte: since } },
  });
  if (recent) return false;

  const msg = `Onboarding stuck ${Math.round(hoursStuck)}h at "${step ?? "?"}" — ${businessName} (${shopId})`;
  // reportError writes the FailureEvent (our dedupe ledger) + fans to Sentry/Slack.
  await reportError(new Error(msg), { source: "job", route: "sweep:stuck", shopId, level: "warn" });
  await notifyAdmins("Onboarding stuck", msg).catch(() => {});
  return true;
}
