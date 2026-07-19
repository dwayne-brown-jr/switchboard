import { ApiCheck, AssertionBuilder, Frequency } from "checkly/constructs";
import { alertChannels } from "../alert-channels";

// Critical path: if either of these is red, the product is down for everyone.
// Budget: 4,320 + 1,440 = 5,760 runs/month (see checkly.config.ts).

const BASE = process.env.MONITOR_BASE_URL ?? "https://getswitchboardhq.com";

// Degraded/failed thresholds, set from measured production latency rather than
// round numbers. Six consecutive probes of /api/health gave:
//   warm  0.24s – 0.40s total (Turso round trip 66–67ms)
//   cold  2.24s total, and a 1.01s outlier with an 858ms Turso round trip
//
// A 2s degraded threshold therefore fired on ordinary cold starts — and at a
// 10-minute frequency the function sits right at the edge of Vercel's warm
// window, so that would have been intermittent false alarms forever. 4s clears
// the observed cold start with headroom while still catching a genuinely sick
// database; 10s is a hard fail.
//
// Deliberately NOT loosened further: unlike the reachability checks, slow here
// is real signal — it usually means Turso, and Turso is the whole product.
const DEGRADED_MS = 4000;
const MAX_MS = 10000;

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
 * The one check that watches the PRODUCT rather than the app.
 *
 * Everything else here can be green while Switchboard is failing at its only
 * promise: if a Twilio number stops routing or a live shop loses its agent
 * version, calls go unanswered and /api/health still reports a healthy app and
 * database. This asserts the voice path itself is intact.
 *
 * There is already a daily cron (jobs/health-check) that pages admins about
 * silent shops. This is deliberately a second, independent path: that one
 * alerts through our own email, so if Resend breaks the warning never arrives
 * and nothing says so. Checkly is out-of-band.
 *
 * Hourly is ample — the silence window is measured in days, and the faster
 * signal it carries (a live shop with no number or no agent version) is a
 * config regression that will not fix itself. Budget: 720 runs/month, taking
 * the project to 7,920 of 10,000.
 */
new ApiCheck("health-call-path", {
  name: "Voice path — live shops still receiving calls",
  tags: ["critical", "voice"],
  frequency: Frequency.EVERY_1H,
  degradedResponseTime: DEGRADED_MS,
  maxResponseTime: MAX_MS,
  alertChannels,
  request: {
    url: `${BASE}/api/health/calls`,
    method: "GET",
    followRedirects: false,
    assertions: [
      AssertionBuilder.statusCode().equals(200),
      // "degraded" means a live shop went silent or can't answer at all. The
      // endpoint returns 200 either way, so the body is the verdict.
      AssertionBuilder.jsonBody("$.status").equals("ok"),
      AssertionBuilder.jsonBody("$.silent").equals(0),
      AssertionBuilder.jsonBody("$.misconfigured").equals(0),
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
