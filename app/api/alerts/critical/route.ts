import { NextResponse } from "next/server";
import { secretEquals } from "@/lib/secure";
import { sendSms } from "@/lib/integrations/twilio";

// Phone-waking alert for the two failures that mean customers can't be served:
// the database is unreachable, or a live shop's voice path is misconfigured.
//
// Checkly's critical checks POST here when they go red. This endpoint texts the
// operator via Twilio. It is the free-plan path to a phone-waking alert:
// Checkly's own SMS is a paid feature that lapses when the trial ends, and its
// email doesn't wake anyone at 3am.
//
// WHY THIS WORKS EVEN WHEN THE DATABASE IS DOWN — the headline case. A DB
// outage does not take Vercel down; the app still serves requests. This handler
// deliberately imports NOTHING that touches the database (no prisma, no
// reportError), so it can still send the text that says "the database is down".
// Its only dependency is Twilio's API.
//
// The one gap, stated honestly: if Vercel itself is down, this endpoint is down
// too and no SMS goes out. Checkly still emails in that case. Total-Vercel-down
// is rarer than a DB hiccup, and closing it means a second host — out of scope
// for a solo operator on a free plan.

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const url = new URL(req.url);

  // Shared secret in the query string — the URL is the credential, so it lives
  // only in Checkly's alert-channel config, never in the repo. Timing-safe.
  if (!secretEquals(url.searchParams.get("secret"), process.env.CRITICAL_ALERT_SECRET)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const to = process.env.OPERATOR_ALERT_PHONE?.trim();
  const from = process.env.TWILIO_ALERT_FROM?.trim();
  if (!to || !from) {
    // Not configured yet. 200 so Checkly doesn't retry-storm a config gap, but
    // say plainly in the body that nothing was sent.
    return NextResponse.json({ ok: false, reason: "OPERATOR_ALERT_PHONE / TWILIO_ALERT_FROM not set" });
  }

  // Checkly posts a JSON body describing the alert; fall back gracefully so a
  // shape change on their side never stops the text going out.
  let name = "A critical check";
  let type = "ALERT";
  try {
    const body = (await req.json()) as { check_name?: string; alert_type?: string };
    if (typeof body.check_name === "string") name = body.check_name;
    if (typeof body.alert_type === "string") type = body.alert_type;
  } catch {
    // no body / not JSON — the static message below is still useful
  }

  const recovered = /recover/i.test(type);
  const text = recovered
    ? `✅ Switchboard recovered: ${name} is passing again.`
    : `🚨 Switchboard ALERT: ${name} is failing. Customers may not be served. Check Checkly + /api/health.`;

  const sent = await sendSms(to, from, text);
  return NextResponse.json({ ok: sent });
}
