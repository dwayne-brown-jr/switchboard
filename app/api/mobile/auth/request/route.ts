import { NextResponse } from "next/server";
import { requestMobileCode } from "@/lib/mobileAuth";
import { rateLimit } from "@/lib/ratelimit";
import { clientIp } from "@/lib/clientip";
import { reportError } from "@/lib/observability";

// Owner mobile app: request a 6-digit sign-in code by email. Always returns ok
// (even for unknown emails) so it can't be used to enumerate accounts.
export async function POST(req: Request) {
  const ip = clientIp(req);
  if (!(await rateLimit("mobileAuth", ip, { failClosed: true }))) {
    return NextResponse.json({ error: "Too many attempts. Try again in a bit." }, { status: 429 });
  }
  try {
    const { email } = (await req.json().catch(() => ({}))) as { email?: string };
    if (!email || !/.+@.+\..+/.test(email)) {
      return NextResponse.json({ error: "A valid email is required." }, { status: 400 });
    }
    await requestMobileCode(email);
    return NextResponse.json({ ok: true });
  } catch (e) {
    await reportError(e, { source: "request", route: "mobile/auth/request" });
    return NextResponse.json({ error: "Couldn't send the code. Try again." }, { status: 500 });
  }
}
