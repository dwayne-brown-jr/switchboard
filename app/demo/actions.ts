"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth, takePendingDemoLink } from "@/lib/auth";
import { isDemoLoginEnabled, demoEmail, verifyDemoCode } from "@/lib/demo-login";
import { rateLimit } from "@/lib/ratelimit";

/** Exchange the reviewer code for a real session on the demo account.
 *
 *  Runs better-auth's ordinary magic-link sign-in and follows the link
 *  server-side (lib/auth.ts captures it instead of emailing, since there's no
 *  inbox to check). No second session mechanism, no bypass of session issuing. */
export async function signInDemo(formData: FormData) {
  if (!isDemoLoginEnabled()) redirect("/demo?error=off");

  // Brute-force guard: the code is short by design, so throttle attempts.
  if (!(await rateLimit("demoLogin", "global"))) redirect("/demo?error=slow");

  if (!verifyDemoCode(String(formData.get("code") ?? ""))) redirect("/demo?error=bad");

  await auth.api.signInMagicLink({
    body: { email: demoEmail()!, callbackURL: "/app" },
    headers: await headers(),
  });

  const url = takePendingDemoLink();
  if (!url) redirect("/demo?error=retry");

  // Following this sets the session cookie and lands on /app.
  redirect(url);
}
