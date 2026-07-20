// Alerting on our own failure feed.
//
// Every other check asks a specific question we thought to ask. This one asks
// "is anything throwing that wasn't before" — it covers failure modes nobody
// anticipated, which is most of them. reportError() already writes every
// failure to FailureEvent; until now nothing ever read it.
//
// Pure and free of "server-only" so it stays unit testable, matching how the
// other tested libs here are structured. lib/health.ts does the query.

/** Rolling window. Must be >= the check's frequency or spikes fall between
 *  runs unnoticed; it is currently equal to it (hourly), so coverage is
 *  continuous. */
export const ERROR_WINDOW_MINUTES = 60;

/** Measured baseline in production was 2 errors across seven days, so three in
 *  a single hour is a genuine spike rather than noise. Tunable because that
 *  baseline only holds while traffic is low — raise it as real call volume
 *  arrives, or this becomes the alert everyone learns to ignore. */
const DEFAULT_THRESHOLD = 3;

export function errorAlertThreshold(): number {
  const raw = Number(process.env.ERROR_ALERT_THRESHOLD);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : DEFAULT_THRESHOLD;
}

export type ErrorFeedStatus = {
  status: "ok" | "degraded";
  /** error-level events in the window — the only thing that alerts. */
  errors: number;
  /** warn-level events, reported for context only. */
  warns: number;
  windowMinutes: number;
  threshold: number;
};

/** Decide whether the failure feed looks abnormal.
 *
 *  Warns deliberately never alert. The two that actually occur — sweep:stuck
 *  and health:silent — are routine operational signals that already have their
 *  own dedicated alerting, so paging on them again would be duplicate noise for
 *  something already handled. */
export function classifyErrorFeed(
  counts: { errors: number; warns: number },
  threshold: number,
  windowMinutes: number = ERROR_WINDOW_MINUTES,
): ErrorFeedStatus {
  return {
    status: counts.errors >= threshold ? "degraded" : "ok",
    errors: counts.errors,
    warns: counts.warns,
    windowMinutes,
    threshold,
  };
}
