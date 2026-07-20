// The shop whose agent answers the demo number printed on the landing page.
//
// Distinct from DEMO_SHOP_ID in lib/demo-login.ts — that one is the seeded
// reviewer shop full of mock calls, used for dashboard sign-in. This is a real
// shop taking real calls from strangers, which makes it the one shop where
// "safe for a logged-in owner" and "safe in public" diverge.
//
// Pure and env-driven on purpose: no "server-only" so it stays unit testable,
// and no hardcoded id so the demo can move shops without a code change.

export function publicDemoShopId(): string | null {
  return process.env.PUBLIC_DEMO_SHOP_ID?.trim() || null;
}

/** True when this shop's agent is reachable from the public demo number.
 *
 *  Anything that would be fine for a private customer but dangerous when a
 *  stranger can dial it should be gated on this — the live handoff being the
 *  first example (see lib/steps/provision.ts). */
export function isPublicDemoShop(shopId: string): boolean {
  const id = publicDemoShopId();
  return id !== null && id === shopId;
}
