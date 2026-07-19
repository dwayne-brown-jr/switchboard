import { ApiCheck, AssertionBuilder, Frequency } from "checkly/constructs";
import { alertChannels } from "../alert-channels";

// Reachability only — deliberately NO fake payloads.
//
// These handlers have real side effects: call-events writes CallRecords and can
// fire owner SMS/push; the Twilio SMS webhook records STOP/START consent. There
// is no sandbox mode, so posting synthetic traffic to production would corrupt
// call history and could mark a real owner as opted-out. Instead we send GET to
// POST-only routes and assert 405: that proves the route is deployed and
// routable without invoking any handler logic.
//
// Verified against production — every one of these returns 405 on GET today.
// If one starts returning 200, that's a genuine regression (a handler that
// suddenly accepts GET), and this check will catch it.
//
// Note these are low-frequency by design: the whole app deploys atomically, so
// route-existence is largely implied by the health check. These catch routing
// and middleware regressions, not outages. Budget: 720 runs/month.

const BASE = process.env.MONITOR_BASE_URL ?? "https://getswitchboardhq.com";

// Cold-start tolerance. These routes are hit hourly at most (call-events only
// sees real Retell traffic), so on Vercel they are ALWAYS cold when we probe
// them — a first hit measured 2s in testing. With a 2s degraded threshold that
// meant a degraded alert on literally every run, forever.
//
// Latency is not the signal here anyway: these checks answer "is the route
// deployed and routable", and that's the status code's job. Thresholds are set
// loose enough that only a genuinely stuck edge trips them. The health check
// keeps tight thresholds, because there slow IS the signal.
const COLD_DEGRADED_MS = 6000;
const COLD_MAX_MS = 12000;

/**
 * The Retell webhook. Every completed call posts here; if it breaks, calls
 * still get answered but nothing is recorded — no dashboard, no digest, no
 * owner alerts. Silent data loss, which is why it's the one webhook checked
 * hourly rather than daily.
 */
new ApiCheck("webhook-retell-call-events", {
  name: "Webhook reachable — Retell call-events",
  tags: ["webhooks", "critical"],
  frequency: Frequency.EVERY_1H,
  degradedResponseTime: COLD_DEGRADED_MS,
  maxResponseTime: COLD_MAX_MS,
  alertChannels,
  // REQUIRED when the expected status is an error code. Checkly fails any
  // non-2xx response by default, regardless of assertions — without this the
  // check reports failed while printing "✔ status code equals 405. Received:
  // 405." Inverting it means the assertions below decide the verdict, so a 405
  // passes and an unexpected 200 or 404 fails.
  shouldFail: true,
  request: {
    url: `${BASE}/api/agent/call-events`,
    method: "GET",
    followRedirects: false,
    assertions: [
      // 405 = deployed and method-guarded. A 404 means the route vanished.
      AssertionBuilder.statusCode().equals(405),
    ],
  },
});

/**
 * The public A2P opt-in page. Carriers fetch this URL during 10DLC campaign
 * review — the campaign was already rejected once (error 30924) for consent
 * language they couldn't reach. If this 404s mid-review, texting stays blocked.
 */
new ApiCheck("public-sms-opt-in", {
  name: "A2P opt-in page (carrier-visible)",
  tags: ["compliance"],
  frequency: Frequency.EVERY_1H,
  degradedResponseTime: COLD_DEGRADED_MS,
  maxResponseTime: COLD_MAX_MS,
  alertChannels,
  request: {
    url: `${BASE}/sms-opt-in`,
    method: "GET",
    followRedirects: true,
    assertions: [
      AssertionBuilder.statusCode().equals(200),
      // The exact consent sentence a carrier looks for. If this string ever
      // stops matching the live checkbox in app/app/go-live/walls.tsx, the
      // registration is inaccurate — a compliance problem, not a cosmetic one.
      AssertionBuilder.textBody().contains("Reply STOP to unsubscribe"),
    ],
  },
});
