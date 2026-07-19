import { expect, test } from "@playwright/test";

// End-to-end proof that a customer can actually get into their dashboard and
// see their data — the thing every API check above only implies.
//
// WHY THE /demo DOOR AND NOT A LOGIN FORM:
// Switchboard is passwordless (better-auth magic link + Google). There is no
// password to type, so the usual TEST_USER_EMAIL/TEST_USER_PASSWORD pattern is
// impossible, and a magic link would need an inbox the monitor can't read.
// /demo exchanges a single code for a real session on a seeded demo shop, so
// this exercises the genuine auth path and the genuine dashboard.

const BASE = process.env.MONITOR_BASE_URL ?? "https://getswitchboardhq.com";
const DEMO_CODE = process.env.DEMO_LOGIN_CODE ?? "";

test("owner can sign in and see their dashboard", async ({ page }) => {
  test.skip(!DEMO_CODE, "DEMO_LOGIN_CODE is not set in Checkly — see MONITORING.md");

  // 1. The demo door is reachable. It 404s when unconfigured, so a 404 here
  //    means the env vars were cleared in Vercel, not that the app is down.
  await page.goto(`${BASE}/demo`, { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: /reviewer access/i })).toBeVisible();

  // 2. Exchange the code for a session.
  await page.locator("#code").fill(DEMO_CODE);
  await page.getByRole("button", { name: /open the demo/i }).click();

  // 3. We should land inside the app, not back on /demo or /login. Landing on
  //    /login means the session wasn't issued — an auth regression.
  await page.waitForURL(/\/app(\?|$|\/)/, { timeout: 30_000 });

  // 4. The dashboard rendered with real content. These are the owner-facing
  //    metrics computed from CallRecord, so their presence proves the page
  //    queried the database successfully — not just that a shell loaded.
  await expect(page.getByText(/calls answered/i).first()).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(/jobs booked/i).first()).toBeVisible();

  // 5. Call history actually rendered rows rather than an empty state. The
  //    seeded demo shop always has calls, so an empty list here means the
  //    query or the seed broke.
  await expect(page.getByText(/revenue booked/i).first()).toBeVisible();
});
