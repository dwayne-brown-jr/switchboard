import { BrowserCheck, Frequency } from "checkly/constructs";
import { alertChannels } from "../alert-channels";

// Budget: hourly = 720 runs/month against a 1,000/month free-tier browser
// allowance. Every 15m would be 2,880 — nearly 3x over the cap, at which point
// Checkly stops running ALL browser checks for the month.
//
// ACTIVE. Both prerequisites are in place (see MONITORING.md):
//   1. DEMO_LOGIN_EMAIL + DEMO_LOGIN_CODE are set in Vercel (production) and the
//      demo shop is seeded via scripts/seed-demo-shop.mjs, so /demo resolves
//      rather than 404ing.
//   2. DEMO_LOGIN_CODE is stored as a *secret* environment variable in Checkly,
//      so the spec can read it. NEVER hardcode it here; this file is committed.
//
// If the demo code is ever rotated it must change in BOTH places or this check
// fails on sign-in. The spec still self-skips on a missing code, so clearing the
// Checkly variable degrades to skipped rather than a false alarm.
new BrowserCheck("dashboard-login-flow", {
  name: "Dashboard — sign in and load call history",
  tags: ["critical", "dashboard"],
  // Active. This check caught a real bug the first time it ran: demo sign-in
  // redirected to the magic-link URL from a Server Action, so Next resolved that
  // redirect server-side and the session cookie never reached the browser. Fixed
  // by moving the redirect into a route handler — see app/demo/enter/route.ts.
  //
  // Re-enabled only after four passing runs spaced past better-auth's 60s auth
  // rate-limit window, at a steady 9-10s. One green run is not evidence of a
  // working flow; that mistake is what put this check live while broken.
  activated: true,
  frequency: Frequency.EVERY_1H,
  alertChannels,
  code: {
    entrypoint: "./dashboard.spec.ts",
  },
});
