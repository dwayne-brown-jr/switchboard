// Pure voice-path reasoning, kept free of "server-only" and Prisma so it can be
// unit tested (lib/call-path.test.ts). lib/health.ts does the database work and
// delegates the actual judgement here.

/** How long a shop that WAS receiving calls must be quiet before we call it
 *  broken. Days, not hours: real shops have weekends and slow stretches, and a
 *  false "your phone is broken" alert costs more trust than a late true one. */
export const SILENT_DAYS = Number(process.env.SILENT_SHOP_DAYS ?? 4);

export type CallPathStatus = {
  status: "ok" | "degraded";
  /** Live shops that had call history and have since gone quiet past SILENT_DAYS. */
  silent: number;
  /** Live shops missing the number or agent version they need to answer at all. */
  misconfigured: number;
};

export type LiveShop = {
  id: string;
  agentNumber: string | null;
  liveVersionId: string | null;
};

/** Decide whether the voice path is healthy.
 *
 *  Shops with no entry in `lastCallByShop` have no call history at all and are
 *  skipped: a brand-new shop and a broken one look identical, and guessing
 *  wrong means alarming an owner about a phone that was never going to ring
 *  yet. */
export function classifyCallPath(
  live: LiveShop[],
  lastCallByShop: Map<string, Date>,
  now: number,
): CallPathStatus {
  const cutoff = now - SILENT_DAYS * 86_400_000;

  let misconfigured = 0;
  let silent = 0;

  for (const shop of live) {
    if (!shop.agentNumber || !shop.liveVersionId) {
      misconfigured++;
      continue; // can't answer at all — silence is a given, not a second finding
    }
    const last = lastCallByShop.get(shop.id);
    if (last && last.getTime() < cutoff) silent++;
  }

  return {
    status: silent === 0 && misconfigured === 0 ? "ok" : "degraded",
    silent,
    misconfigured,
  };
}
