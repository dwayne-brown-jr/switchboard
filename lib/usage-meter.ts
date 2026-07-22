// Display state for the owner's minutes meter.
//
// The pricing page promises: "we'd shift you to our higher tier — and tell you
// before we do. Nothing extra to pick, and never a surprise bill." Until this
// existed the product told them AFTER, by email, once the plan had already
// changed. A meter is what makes that sentence true.
//
// Pure and free of "server-only" so it stays unit tested. lib/usage.ts owns the
// counting; this only decides how to show it.

/** Warn with enough runway to react. At 80% of 500 minutes a typical shop has
 *  several days left, which is time to call rather than time to be surprised. */
export const APPROACHING_PCT = 80;

export type UsageTone = "ok" | "approaching" | "over";

export type UsageMeterState = {
  used: number;
  included: number;
  /** Clamped to 100 — the bar can't overflow its track. */
  pct: number;
  /** Uncapped, so copy can say "112% of your included minutes". */
  rawPct: number;
  remaining: number;
  tone: UsageTone;
};

export function usageMeter(used: number, included: number): UsageMeterState {
  const safeUsed = Math.max(0, Math.round(used || 0));

  // A plan with no sensible allowance can't be measured against. Report it as
  // fine rather than dividing by zero and screaming at an owner about a number
  // that means nothing.
  if (!Number.isFinite(included) || included <= 0) {
    return { used: safeUsed, included: 0, pct: 0, rawPct: 0, remaining: 0, tone: "ok" };
  }

  const rawPct = Math.round((safeUsed / included) * 100);
  return {
    used: safeUsed,
    included,
    pct: Math.min(100, rawPct),
    rawPct,
    remaining: Math.max(0, included - safeUsed),
    // Strictly over, matching usageStatus().over in lib/usage.ts — landing
    // exactly on your included minutes is not an overage, and the meter must
    // never disagree with the thing that actually changes the bill.
    tone: safeUsed > included ? "over" : rawPct >= APPROACHING_PCT ? "approaching" : "ok",
  };
}
