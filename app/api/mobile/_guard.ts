import { NextResponse } from "next/server";
import { requireMobileUser, type MobileAuth } from "@/lib/mobileAuth";
import { rateLimit } from "@/lib/ratelimit";

// Shared preamble for authenticated mobile routes: verify the device bearer
// token, then rate-limit per device. Returns the auth context or a Response to
// return directly. (Underscore prefix keeps this out of the route table.)
export async function mobileGuard(req: Request): Promise<{ auth: MobileAuth } | { error: NextResponse }> {
  const auth = await requireMobileUser(req);
  if (!auth) return { error: NextResponse.json({ error: "unauthorized" }, { status: 401 }) };
  if (!(await rateLimit("mobileApi", auth.deviceId))) {
    return { error: NextResponse.json({ error: "rate limited" }, { status: 429 }) };
  }
  return { auth };
}
