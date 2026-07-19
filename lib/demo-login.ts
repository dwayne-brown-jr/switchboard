import "server-only";
import { secretEquals } from "./secure";

// Read-only-ish demo access for outside reviewers.
//
// A reviewer types a code at /demo and lands in a real owner dashboard backed by
// a seeded shop full of MOCK calls. It reuses better-auth's normal magic-link
// sign-in (we just suppress the email and follow the link server-side), so there
// is no second session mechanism to get wrong.
//
// Deliberately env-driven, never hardcoded:
//   * nothing secret enters git history,
//   * access is revoked by clearing one env var (no deploy of code required),
//   * the whole path 404s unless BOTH vars are set, so it cannot be left on by
//     accident in an environment that never configured it.
//
// The demo account is a normal, non-admin user pointed at a seeded shop, so the
// blast radius is that shop's fake data. Keep it that way: never point
// DEMO_LOGIN_EMAIL at an admin or at a shop with real billing/telephony.

export function demoEmail(): string | null {
  return process.env.DEMO_LOGIN_EMAIL?.trim() || null;
}

function demoCode(): string | null {
  return process.env.DEMO_LOGIN_CODE?.trim() || null;
}

/** Demo sign-in is available only when both the account and the code are set. */
export function isDemoLoginEnabled(): boolean {
  return Boolean(demoEmail() && demoCode());
}

/** True when `email` is the configured demo account (used to suppress the
 *  magic-link email and capture the URL instead — see lib/auth.ts). */
export function isDemoEmail(email: string | null | undefined): boolean {
  const demo = demoEmail();
  return Boolean(demo && email && email.toLowerCase() === demo.toLowerCase());
}

/** Constant-time compare of a submitted code against the configured one. */
export function verifyDemoCode(submitted: string | null | undefined): boolean {
  const expected = demoCode();
  if (!expected || !submitted) return false;
  return secretEquals(submitted.trim(), expected);
}
