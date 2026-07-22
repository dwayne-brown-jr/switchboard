import { defineConfig } from "checkly";
import { Frequency, RetryStrategyBuilder } from "checkly/constructs";

// Switchboard production monitoring (monitoring-as-code).
//
// FREE-TIER BUDGET — read before changing any frequency or location.
// The Hobby plan allows 10,000 API-check runs and 1,000 browser-check runs per
// month, and HARD-CAPS: once exhausted, checks stop running. Silent loss of
// monitoring is worse than none, so everything here is sized with headroom.
//
// Runs/month = (43,200 / frequencyMinutes) x numberOfLocations.
//   every 5m  = 8,640   (86% of the entire API budget on one check)
//   every 10m = 4,320
//   every 30m = 1,440
//   every 60m =   720
//
// Current spend: 9,000 / 10,000 API runs, 720 / 1,000 browser runs.
//
// ONE LOCATION ON PURPOSE. Locations multiply run count, so us-west-1 only —
// it is also closest to the California local businesses we serve and to the
// Vercel region. Adding us-east-1 doubles every number above and would blow the
// cap. Add it when on Starter ($24/mo, 25k API runs); see MONITORING.md.
export default defineConfig({
  projectName: "Switchboard Production Monitoring",
  logicalId: "switchboard-monitoring",
  repoUrl: "https://github.com/DB28319496/switchboard",
  checks: {
    activated: true,
    muted: false,
    // Conservative default; individual checks override where it matters.
    frequency: Frequency.EVERY_30M,
    locations: ["us-west-1"],
    tags: ["switchboard"],
    // Retry once before alerting so a single blip doesn't page us. sameRegion
    // is false so the retry prefers a different region when the plan allows
    // more than one location — with a single location it simply retries there.
    retryStrategy: RetryStrategyBuilder.fixedStrategy({
      maxRetries: 1,
      baseBackoffSeconds: 30,
      sameRegion: false,
    }),
    checkMatch: "**/__checks__/**/*.check.ts",
    ignoreDirectoriesMatch: ["node_modules/**", ".next/**", "mobile/**", ".claude/**"],
  },
  cli: {
    runLocation: "us-west-1",
    reporters: ["list"],
  },
});
