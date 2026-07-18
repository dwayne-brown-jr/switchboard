import { NextResponse } from "next/server";
import { authAgentShop } from "@/lib/agentAuth";
import { sendSms } from "@/lib/integrations/twilio";
import { canSendSms } from "@/lib/a2p";
import { rateLimit } from "@/lib/ratelimit";
import { reportError } from "@/lib/observability";

// Agent tool: text the owner about an emergency / important message. Unlike the
// old n8n node (which sent unconditionally), we GATE the SMS on A2P approval —
// texting before the carrier campaign is approved is a compliance violation.
// Either way we return ok so the agent proceeds; the call-events email backstop
// still reaches the owner if SMS is gated off.
export async function POST(req: Request) {
  const shop = await authAgentShop(new URL(req.url));
  if (!shop) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  try {
    const body = (await req.json().catch(() => ({}))) as { args?: { message?: string }; message?: string };
    const message = (body.args?.message || body.message || "New important call.").slice(0, 300);

    if (!shop.ownerMobile || !shop.agentNumber) {
      return NextResponse.json({ ok: true, delivered: false, note: "no owner number on file" });
    }
    if (!canSendSms(shop)) {
      return NextResponse.json({ ok: true, delivered: false, note: "texting not enabled" });
    }
    if (!(await rateLimit("agentNotify", shop.id))) {
      return NextResponse.json({ ok: true, delivered: false, note: "rate limited" });
    }

    const { withOptOut } = await import("@/lib/sms-consent");
    const delivered = await sendSms(shop.ownerMobile, shop.agentNumber, withOptOut(`${shop.businessName}: ${message}`));
    return NextResponse.json({ ok: true, delivered });
  } catch (e) {
    // Never fail the agent's tool call — capture and report not-delivered.
    await reportError(e, { source: "request", route: "agent/notify-owner", shopId: shop.id });
    return NextResponse.json({ ok: true, delivered: false, note: "notify failed" });
  }
}
