import { NextResponse } from "next/server";
import { verifyMobileCode } from "@/lib/mobileAuth";
import { rateLimit } from "@/lib/ratelimit";
import { clientIp } from "@/lib/clientip";
import { reportError } from "@/lib/observability";

// Owner mobile app: verify the emailed code and, on success, return a long-lived
// device bearer token the app stores in secure storage.
export async function POST(req: Request) {
  const ip = clientIp(req);
  if (!(await rateLimit("mobileAuth", ip, { failClosed: true }))) {
    return NextResponse.json({ error: "Too many attempts. Try again in a bit." }, { status: 429 });
  }
  try {
    const body = (await req.json().catch(() => ({}))) as {
      email?: string;
      code?: string;
      platform?: string;
      pushToken?: string;
    };
    if (!body.email || !body.code) {
      return NextResponse.json({ error: "Email and code are required." }, { status: 400 });
    }
    const res = await verifyMobileCode(body.email, body.code.trim(), {
      platform: body.platform,
      pushToken: body.pushToken,
    });
    if (!res.ok) {
      const msg = res.reason === "expired" ? "That code expired — request a new one." : res.reason === "locked" ? "Too many tries — request a new code." : "That code isn't right.";
      return NextResponse.json({ error: msg }, { status: 401 });
    }
    return NextResponse.json({ token: res.token });
  } catch (e) {
    await reportError(e, { source: "request", route: "mobile/auth/verify" });
    return NextResponse.json({ error: "Couldn't verify the code. Try again." }, { status: 500 });
  }
}
