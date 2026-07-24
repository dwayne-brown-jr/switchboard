// Service-level objective for the availability lookup — the one piece of work
// that runs WHILE a caller is on the line waiting for an answer.
//
// Pure and free of "server-only" so the threshold logic is unit tested. The
// endpoint (app/api/health/availability) does the timing.

/** The objective: the availability computation completes within this many
 *  milliseconds. Set from the staging stress test (check-availability measured
 *  p50 278ms / p95 1100ms, warm, against real Turso), with headroom. If p95
 *  drifts toward this number under real load, that is the signal to cache the
 *  shop's live config rather than re-read it on every tool call. */
export const AVAILABILITY_SLO_MS = 1500;

export type SloTone = "ok" | "slow";

export type SloStatus = {
  status: SloTone;
  ms: number;
  sloMs: number;
};

/** Judge a single measured computation time against the objective.
 *
 *  Deliberately measures the COMPUTATION, not the HTTP round trip. During a
 *  live call the agent hits these tools repeatedly, so the endpoint is warm;
 *  timing the round trip on an hourly probe would measure Vercel cold-start
 *  noise instead of what a caller actually waits for — the same cold-start
 *  false positive that forced the webhook checks to loosen their thresholds. */
export function classifySlo(ms: number, sloMs: number = AVAILABILITY_SLO_MS): SloStatus {
  const safe = Math.max(0, Math.round(ms));
  return {
    status: safe > sloMs ? "slow" : "ok",
    ms: safe,
    sloMs,
  };
}
