import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { validateTwilioSignature } from "@/lib/integrations/twilio";
import { parseSmsKeyword, helpReplyText, messagingTwiml } from "@/lib/sms-consent";
import { toE164 } from "@/lib/phone";
import { logAudit } from "@/lib/audit";
import { reportError } from "@/lib/observability";

// Inbound SMS to a shop's agent number (each number's SmsUrl points here).
// The only people we ever text are shop OWNERS, so this route exists for
// compliance keywords: STOP/START flip the shop's opt-out flag, HELP gets a
// program-identification reply (an A2P requirement). Twilio's own default
// opt-out handling already blocks the pair at their edge and auto-replies to
// STOP/START — we persist the state so we stop attempting sends, and we stay
// silent on STOP/START to avoid duplicating Twilio's confirmations.
function twiml(body: string) {
  return new NextResponse(body, { headers: { "Content-Type": "text/xml" } });
}

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const params: Record<string, string> = {};
    formData.forEach((v, k) => {
      if (typeof v === "string") params[k] = v;
    });

    // Twilio signs the PUBLIC url it was told to call — reconstruct from
    // APP_URL (req.url can differ behind the proxy).
    const url = `${process.env.APP_URL ?? "http://localhost:3000"}/api/webhooks/twilio/sms`;
    if (!validateTwilioSignature(url, params, req.headers.get("x-twilio-signature"))) {
      return NextResponse.json({ error: "bad signature" }, { status: 403 });
    }

    const keyword = parseSmsKeyword(params.Body);
    if (!keyword) return twiml(messagingTwiml()); // normal message — no auto-reply

    const shop = await prisma.shop.findFirst({ where: { agentNumber: params.To } });
    if (!shop) return twiml(messagingTwiml());

    if (keyword === "help") {
      return twiml(messagingTwiml(helpReplyText(shop.businessName)));
    }

    // STOP/START only flip state when it's the owner's own number — anyone
    // else never receives texts from us, and Twilio blocks their pair anyway.
    const fromOwner = !!shop.ownerMobile && toE164(shop.ownerMobile) === params.From;
    if (fromOwner) {
      const optOut = keyword === "stop";
      await prisma.shop.update({ where: { id: shop.id }, data: { smsOptOut: optOut } });
      await logAudit(shop.id, null, optOut ? "sms.optout" : "sms.optin", { from: params.From });
    }
    return twiml(messagingTwiml());
  } catch (e) {
    // Best-effort: report and acknowledge so Twilio doesn't hammer retries.
    await reportError(e, { source: "webhook", route: "webhooks/twilio/sms" });
    return twiml(messagingTwiml());
  }
}
