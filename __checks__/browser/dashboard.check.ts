import { BrowserCheck, Frequency } from "checkly/constructs";
import { alertChannels } from "../alert-channels";

// Budget: hourly = 720 runs/month against a 1,000/month free-tier browser
// allowance. Every 15m would be 2,880 — nearly 3x over the cap, at which point
// Checkly stops running ALL browser checks for the month.
//
// ⚠️ STARTS DEACTIVATED. Two things must be true before flipping activated to
// true, both documented in MONITORING.md:
//   1. DEMO_LOGIN_EMAIL + DEMO_LOGIN_CODE set in Vercel (production), and the
//      demo shop seeded via scripts/seed-demo-shop.mjs — otherwise /demo 404s.
//   2. DEMO_LOGIN_CODE set as an environment variable in Checkly, so the spec
//      can read it. NEVER hardcode it here; this file is committed.
//
// Until then the spec self-skips on a missing code, so an accidental activation
// reports skipped rather than a false alarm.
new BrowserCheck("dashboard-login-flow", {
  name: "Dashboard — sign in and load call history",
  tags: ["critical", "dashboard"],
  activated: false, // TODO: set true once the two steps above are done
  frequency: Frequency.EVERY_1H,
  alertChannels,
  code: {
    entrypoint: "./dashboard.spec.ts",
  },
});
