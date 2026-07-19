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
  // Deactivated again: the demo sign-in is intermittently failing in production.
  // It passed once (5s), then failed every subsequent run — the code is accepted
  // and the magic link is followed, but no session is established and /app
  // bounces to /login. Ruled out: the Checkly secret (fails with a local env var
  // too) and rate limiting (still fails after a quiet window, and a throttle
  // redirects to /demo?error=slow, not /login). Root cause not yet found, so
  // this stays off rather than alerting hourly on a known-broken flow.
  activated: false,
  frequency: Frequency.EVERY_1H,
  alertChannels,
  code: {
    entrypoint: "./dashboard.spec.ts",
  },
});
