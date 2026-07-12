import { prisma } from "./db";
import { getVoiceProvider } from "./integrations/voice";
import { unbindPhoneNumber, importPhoneNumber } from "./integrations/retell";
import { logAudit } from "./audit";

// Shop lifecycle transitions (pause/resume). Kept separate so both billing
// events and the owner's dashboard pause switch share one implementation.
//
// IMPORTANT: Retell has no "pause an agent" API — pauseAgent() is a no-op. What
// actually stops the receptionist answering is UNBINDING the phone number from
// Retell. Resume re-imports it. The Twilio number + SIP trunk are kept intact
// throughout, so the shop keeps its number across pause/resume/cancel.

function retellLive(shop: { agentProvider: string | null; agentNumber: string | null }) {
  return Boolean(process.env.RETELL_API_KEY && shop.agentProvider === "retell" && shop.agentNumber);
}

/** Disable the agent (stop answering) and mark the shop paused. Idempotent. */
export async function pauseShopAgent(shopId: string, reason: string, actorId?: string) {
  const shop = await prisma.shop.findUnique({ where: { id: shopId } });
  if (!shop) return;

  // The real stop: unbind the number so inbound calls no longer reach the agent.
  if (retellLive(shop)) {
    try {
      await unbindPhoneNumber(shop.agentNumber!);
    } catch (e) {
      console.error("pause: unbindPhoneNumber failed", e);
    }
  }
  if (shop.agentId && shop.agentProvider) {
    try {
      await getVoiceProvider(shop.agentProvider).pauseAgent(shop.agentId);
    } catch (e) {
      console.error("pauseAgent failed", e);
    }
  }
  await prisma.shop.update({ where: { id: shopId }, data: { status: "paused" } });
  await logAudit(shopId, actorId ?? null, "shop.paused", { reason });
}

/** Re-enable a paused shop's agent. Only meaningful once it has gone live. */
export async function resumeShopAgent(shopId: string, actorId?: string) {
  const shop = await prisma.shop.findUnique({ where: { id: shopId } });
  if (!shop) return;

  // Re-bind the number so it answers again.
  const termUri = process.env.TWILIO_SIP_TERMINATION_URI;
  if (retellLive(shop) && shop.agentId && termUri) {
    try {
      await importPhoneNumber({
        phoneNumber: shop.agentNumber!,
        terminationUri: termUri,
        username: process.env.TWILIO_SIP_USERNAME ?? "",
        password: process.env.TWILIO_SIP_PASSWORD ?? "",
        agentId: shop.agentId,
      });
    } catch (e) {
      console.error("resume: re-bind number failed", e);
    }
  }
  if (shop.agentId && shop.agentProvider) {
    try {
      await getVoiceProvider(shop.agentProvider).resumeAgent(shop.agentId);
    } catch (e) {
      console.error("resumeAgent failed", e);
    }
  }
  await prisma.shop.update({ where: { id: shopId }, data: { status: shop.liveVersionId ? "live" : "onboarding" } });
  await logAudit(shopId, actorId ?? null, "shop.resumed", {});
}
