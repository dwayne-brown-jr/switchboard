import { prisma } from "./db";
import { getVoiceProvider } from "./integrations/voice";
import { unbindPhoneNumber, importPhoneNumber } from "./integrations/retell";
import { releaseNumber } from "./integrations/twilio";
import { logAudit } from "./audit";

// Shop lifecycle transitions (pause/resume/cancel). Kept separate so billing
// events, the owner's dashboard pause switch, and admin actions share one
// implementation.
//
// IMPORTANT: Retell has no "pause an agent" API — pauseAgent() is a no-op. What
// actually stops the receptionist answering is UNBINDING the phone number from
// Retell. Resume re-imports it. Across pause/resume the Twilio number is kept
// intact (the shop keeps its number). Cancellation ALSO keeps the number, but
// only for a grace window — reclaimCanceledNumbers() permanently releases it
// afterward so a churned shop stops costing the platform the monthly fee.

// Days a canceled shop keeps its number before it's permanently released. Gives
// an accidental/temporary cancellation room to resubscribe and keep the number.
const RECLAIM_GRACE_DAYS = Number(process.env.CANCEL_GRACE_DAYS ?? 30);

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

/** Subscription canceled: stop answering (unbind the number, like pause) but mark
 *  the shop CANCELED — distinct from a manual pause — so reclaimCanceledNumbers()
 *  can release the number after the grace window. The number is kept for now in
 *  case the owner resubscribes. Idempotent. */
export async function cancelShop(shopId: string, reason: string) {
  const shop = await prisma.shop.findUnique({ where: { id: shopId } });
  if (!shop) return;

  if (retellLive(shop)) {
    try {
      await unbindPhoneNumber(shop.agentNumber!);
    } catch (e) {
      console.error("cancel: unbindPhoneNumber failed", e);
    }
  }
  if (shop.agentId && shop.agentProvider) {
    try {
      await getVoiceProvider(shop.agentProvider).pauseAgent(shop.agentId);
    } catch (e) {
      console.error("cancel: pauseAgent failed", e);
    }
  }
  await prisma.shop.update({ where: { id: shopId }, data: { status: "canceled" } });
  await logAudit(shopId, null, "shop.canceled", { reason });
}

/** Permanently release the Twilio numbers of shops that have stayed canceled
 *  past the grace window. Runs from a daily cron (/api/jobs/reclaim-numbers).
 *  Idempotent and safe-failing: it re-reads status, uses the cancel audit entry
 *  as the grace clock, skips anything it can't date, and keeps the Retell agent
 *  config (only the paid number is released). */
export async function reclaimCanceledNumbers(): Promise<{ scanned: number; released: number }> {
  const canceled = await prisma.shop.findMany({
    where: { status: "canceled", twilioNumberSid: { not: null } },
    select: { id: true, businessName: true, twilioNumberSid: true },
  });
  const cutoff = Date.now() - RECLAIM_GRACE_DAYS * 86_400_000;
  let released = 0;

  for (const shop of canceled) {
    // Grace clock = when it was canceled (newest cancel audit entry).
    const cancelEvent = await prisma.auditLog.findFirst({
      where: { shopId: shop.id, action: { in: ["shop.canceled", "subscription.canceled"] } },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    });
    // Can't date the cancellation, or still inside the grace window → leave it.
    if (!cancelEvent || cancelEvent.createdAt.getTime() > cutoff) continue;

    try {
      await releaseNumber(shop.twilioNumberSid!);
      // Clear the number so we don't try again and resubscribe re-provisions.
      await prisma.shop.update({ where: { id: shop.id }, data: { twilioNumberSid: null, agentNumber: null } });
      await logAudit(shop.id, null, "number.reclaimed", { numberSid: shop.twilioNumberSid, graceDays: RECLAIM_GRACE_DAYS });
      released++;
    } catch (e) {
      const { reportError } = await import("./observability");
      await reportError(e, { source: "job", route: "reclaim:release", shopId: shop.id });
    }
  }
  return { scanned: canceled.length, released };
}
