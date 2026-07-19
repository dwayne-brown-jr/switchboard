import { ApiCheck, AssertionBuilder, Frequency } from "checkly/constructs";
import { alertChannels } from "../alert-channels";

// Critical path: if either of these is red, the product is down for everyone.
// Budget: 4,320 + 1,440 = 5,760 runs/month (see checkly.config.ts).

const BASE = process.env.MONITOR_BASE_URL ?? "https://getswitchboardhq.com";

// Degraded/failed thresholds are shared so they can't drift apart per check.
const DEGRADED_MS = 2000;
const MAX_MS = 5000;

/**
 * The one check that tests something a deploy can't guarantee: Turso is
 * reachable. Everything else in the app is useless if the database is gone —
 * calls can't be recorded, availability can't be computed, bookings fail.
 * Highest frequency we can afford (4,320 runs/mo = 43% of the API budget).
 */
new ApiCheck("health-db", {
  name: "Health — app + Turso database",
  tags: ["critical", "database"],
  frequency: Frequency.EVERY_10M,
  degradedResponseTime: DEGRADED_MS,
  maxResponseTime: MAX_MS,
  alertChannels,
  request: {
    url: `${BASE}/api/health`,
    method: "GET",
    followRedirects: false,
    assertions: [
      AssertionBuilder.statusCode().equals(200),
      // Asserting the body — not just the status — is the point: the route
      // returns 503 with db:"unreachable" when the query fails, and a bare
      // status check on a misconfigured edge could still see a cached 200.
      AssertionBuilder.jsonBody("$.status").equals("ok"),
      AssertionBuilder.jsonBody("$.db").equals("ok"),
      AssertionBuilder.responseTime().lessThan(MAX_MS),
    ],
  },
});

/**
 * The landing page is the entire top of funnel: the demo call, the ROI
 * calculator and the pricing all live here. A 500 here costs signups directly.
 */
new ApiCheck("landing-page", {
  name: "Landing page",
  tags: ["critical", "marketing"],
  frequency: Frequency.EVERY_30M,
  degradedResponseTime: DEGRADED_MS,
  maxResponseTime: MAX_MS,
  alertChannels,
  request: {
    url: `${BASE}/`,
    method: "GET",
    followRedirects: true,
    assertions: [
      AssertionBuilder.statusCode().equals(200),
      // Proves React actually rendered the page rather than shipping an error
      // shell — this string is the hero headline.
      AssertionBuilder.textBody().contains("Switchboard books the job"),
      AssertionBuilder.responseTime().lessThan(MAX_MS),
    ],
  },
});
