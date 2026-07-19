import "server-only";

// Checkly heartbeat pings for the scheduled jobs.
//
// Called at the END of a job's SUCCESS path only. If a job throws, we
// deliberately don't ping — the missed heartbeat is the alert.
//
// Best-effort by contract: a missing URL or a failed ping must never fail the
// job it reports on. Monitoring that can break the thing it monitors is worse
// than no monitoring.
//
// URLs are looked up through an explicit map rather than a computed
// `process.env[...]` key, because bundlers only reliably inline statically
// referenced env vars.

export type JobName =
  | "onboarding-sweep"
  | "usage-sweep"
  | "reminders"
  | "reclaim-numbers"
  | "health-check"
  | "weekly-digest";

const HEARTBEAT_URLS: Record<JobName, string | undefined> = {
  "onboarding-sweep": process.env.HEARTBEAT_URL_ONBOARDING_SWEEP,
  "usage-sweep": process.env.HEARTBEAT_URL_USAGE_SWEEP,
  reminders: process.env.HEARTBEAT_URL_REMINDERS,
  "reclaim-numbers": process.env.HEARTBEAT_URL_RECLAIM_NUMBERS,
  "health-check": process.env.HEARTBEAT_URL_HEALTH_CHECK,
  "weekly-digest": process.env.HEARTBEAT_URL_WEEKLY_DIGEST,
};

/** Tell Checkly this job completed. Never throws. */
export async function pingHeartbeat(job: JobName): Promise<void> {
  const url = HEARTBEAT_URLS[job];
  // Unset is a normal state (local dev, or before the URL is copied from the
  // Checkly UI) — stay quiet rather than logging noise on every run.
  if (!url) return;
  try {
    await fetch(url, { method: "POST", signal: AbortSignal.timeout(5_000) });
  } catch (e) {
    console.error(`heartbeat ping failed (${job})`, (e as Error).message);
  }
}
