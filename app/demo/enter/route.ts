import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth, takePendingDemoLink } from "@/lib/auth";
import { isDemoLoginEnabled, demoEmail, verifyDemoCode } from "@/lib/demo-login";
import { rateLimit } from "@/lib/ratelimit";

/** Exchange the reviewer code for a real session on the demo account.
 *
 *  Runs better-auth's ordinary magic-link sign-in and hands the link to the
 *  browser (lib/auth.ts captures it instead of emailing, since there's no inbox
 *  to check). No second session mechanism, no bypass of session issuing.
 *
 *  WHY A ROUTE HANDLER AND NOT A SERVER ACTION
 *
 *  This was a Server Action that called redirect() straight at the magic-link
 *  verify URL. That silently broke sign-in: Next resolves a Server Action's
 *  redirect destination ON THE SERVER to build the RSC payload for the next
 *  page, so the framework itself fetched the verify URL. The single-use token
 *  was consumed and a session row created, but the Set-Cookie landed on an
 *  internal response the browser never received — the reviewer arrived at /app
 *  with no cookie and got bounced to /login. The tell was POST /demo taking
 *  ~1150ms while the action itself took ~350ms: the extra ~800ms was Next
 *  following verify (683ms) and rendering /app (100ms) server-side.
 *
 *  A route handler returns an ordinary HTTP redirect, so the BROWSER makes the
 *  verify request, consumes the token exactly once, and receives the cookie.
 *
 *  Keep this a route handler. Any redirect to a single-use, side-effecting URL
 *  must be issued to the browser, never from a Server Action.
 */

function back(req: Request, error: string) {
  return NextResponse.redirect(new URL(`/demo?error=${error}`, req.url), 303);
}

export async function POST(req: Request) {
  if (!isDemoLoginEnabled()) return back(req, "off");

  // Brute-force guard: the code is short by design, so throttle attempts.
  if (!(await rateLimit("demoLogin", "global"))) return back(req, "slow");

  const form = await req.formData();
  if (!verifyDemoCode(String(form.get("code") ?? ""))) return back(req, "bad");

  await auth.api.signInMagicLink({
    body: { email: demoEmail()!, callbackURL: "/app" },
    headers: await headers(),
  });

  const url = takePendingDemoLink();
  if (!url) return back(req, "retry");

  // 303 so the browser re-issues as GET. Following this sets the session cookie
  // and lands on /app.
  return NextResponse.redirect(url, 303);
}
