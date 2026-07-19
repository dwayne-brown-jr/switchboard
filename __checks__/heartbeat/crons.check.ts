import { HeartbeatMonitor } from "checkly/constructs";
import { alertChannels } from "../alert-channels";

// One heartbeat per QStash cron. These are the highest-value monitors we have:
// a silently dead cron is invisible from the outside — the app stays up, pages
// return 200, and meanwhile onboarding runs stall, cancelled numbers keep
// billing, and nobody gets their weekly digest.
//
// They also cost nothing against the run budget: the job pings us, we don't poll.
//
// Periods mirror scripts/setup-qstash.mjs exactly. Grace is deliberately
// generous — a cron that fires a few minutes late is normal (QStash retries,
// cold starts); a cron that misses its whole window is not.
//
// Each monitor's ping URL must be copied from the Checkly UI after deploy into
// the matching Vercel env var (see MONITORING.md). Until a URL is set, the job
// simply doesn't ping and the monitor will alert — so set them promptly or
// leave these deactivated.

new HeartbeatMonitor("cron-onboarding-sweep", {
  name: "Cron — onboarding sweep (every 30m)",
  tags: ["cron", "critical"],
  period: 30,
  periodUnit: "minutes",
  // Two missed cycles before paging: one late run is noise, two is a problem.
  grace: 35,
  graceUnit: "minutes",
  alertChannels,
});

new HeartbeatMonitor("cron-usage-sweep", {
  name: "Cron — usage sweep (daily 08:00 UTC)",
  tags: ["cron", "billing"],
  period: 1,
  periodUnit: "days",
  grace: 4,
  graceUnit: "hours",
  alertChannels,
});

new HeartbeatMonitor("cron-reminders", {
  name: "Cron — dunning + onboarding reminders (daily 16:00 UTC)",
  tags: ["cron", "billing"],
  period: 1,
  periodUnit: "days",
  grace: 4,
  graceUnit: "hours",
  alertChannels,
});

new HeartbeatMonitor("cron-reclaim-numbers", {
  name: "Cron — reclaim cancelled numbers (daily 03:00 UTC)",
  tags: ["cron", "billing"],
  period: 1,
  periodUnit: "days",
  grace: 4,
  graceUnit: "hours",
  alertChannels,
});

new HeartbeatMonitor("cron-health-check", {
  name: "Cron — platform health check (daily 15:00 UTC)",
  tags: ["cron"],
  period: 1,
  periodUnit: "days",
  grace: 4,
  graceUnit: "hours",
  alertChannels,
});

new HeartbeatMonitor("cron-weekly-digest", {
  name: "Cron — weekly owner digest (Mondays 14:00 UTC)",
  tags: ["cron", "retention"],
  period: 7,
  periodUnit: "days",
  // A day of slack: the digest is the retention email, worth knowing about,
  // but a few hours late is harmless.
  grace: 1,
  graceUnit: "days",
  alertChannels,
});
