// Voice capacity headroom.
//
// Retell caps how many calls we can have in flight at once. Measured on the
// live account: limit 20, burst 60, purchasable to 180. Nothing tracked this,
// so the first sign of hitting it would have been callers getting nothing —
// the exact failure the whole product exists to prevent.
//
// Pure and free of "server-only" so it stays unit testable; lib/health.ts makes
// the API call.

/** Warn well before the ceiling. Buying more concurrency is a support ticket,
 *  not a deploy, so the alert has to arrive with days of room rather than
 *  minutes. */
const DEFAULT_WARN_PCT = 70;

export function capacityWarnPct(): number {
  const raw = Number(process.env.CAPACITY_WARN_PCT);
  return Number.isFinite(raw) && raw > 0 && raw <= 100 ? Math.floor(raw) : DEFAULT_WARN_PCT;
}

export type CapacityStatus = {
  /** ok = headroom · degraded = near the ceiling · unknown = could not ask */
  status: "ok" | "degraded" | "unknown";
  used: number;
  limit: number;
  utilizationPct: number;
  warnPct: number;
};

/** Classify concurrency headroom.
 *
 *  "unknown" is a first-class outcome, not an error. If Retell's API is
 *  unreachable that is a vendor blip we cannot act on, and MONITORING.md is
 *  explicit that we do not page for those — the check treats unknown as a pass.
 *  Only genuine saturation, which we CAN fix by buying concurrency, alerts. */
export function classifyCapacity(
  reading: { used: number; limit: number } | null,
  warnPct: number,
): CapacityStatus {
  if (!reading || !Number.isFinite(reading.limit) || reading.limit <= 0) {
    return { status: "unknown", used: 0, limit: 0, utilizationPct: 0, warnPct };
  }
  const used = Math.max(0, reading.used);
  const utilizationPct = Math.round((used / reading.limit) * 100);
  return {
    status: utilizationPct >= warnPct ? "degraded" : "ok",
    used,
    limit: reading.limit,
    utilizationPct,
    warnPct,
  };
}
