import { prisma } from "./db";
import { submitA2P as twilioSubmitA2P, getA2PStatus, configureNumberSmsWebhook, type A2PBusinessInfo } from "./integrations/twilio";
import { agentBaseUrl } from "./integrations/agentTools";
import { scheduleJob } from "./qstash";
import { completeUserStep } from "./engine";
import { notifyAdmins } from "./notify";
import { sendEmail } from "./email";
import { logAudit } from "./audit";

// A2P 10DLC: collected in-wizard, submitted by the platform on the shop's
// behalf, then polled in the background. It runs in PARALLEL and does not block
// go-live — the a2p step completes on submit (or skip); only SMS *features* wait
// for carrier approval.

/** True once texting is approved AND the owner hasn't replied STOP — gates all
 *  SMS-dependent features. */
export function canSendSms(shop: { a2pStatus: string | null; smsOptOut?: boolean }): boolean {
  return shop.a2pStatus === "approved" && !shop.smsOptOut;
}

export async function submitA2P(shopId: string, info: A2PBusinessInfo, smsConsent: boolean) {
  const shop = await prisma.shop.findUnique({ where: { id: shopId }, include: { run: true } });
  if (!shop?.run) throw new Error("Setup not ready.");
  if (!shop.twilioNumberSid) throw new Error("Phone number not provisioned yet.");
  // A2P campaigns require documented opt-in — no consent, no texting.
  if (!smsConsent) throw new Error("Please agree to receive text alerts (or skip texting for now).");

  const res = await twilioSubmitA2P(shopId, info, shop.twilioNumberSid);
  await prisma.shop.update({
    where: { id: shopId },
    data: {
      a2pBrandSid: res.brandSid,
      a2pCampaignSid: res.campaignSid,
      a2pMessagingServiceSid: res.messagingServiceSid,
      a2pStatus: "submitted",
      // Fresh explicit consent re-opts-in (clears a stale STOP).
      smsConsentAt: new Date(),
      smsOptOut: false,
    },
  });
  await logAudit(shopId, null, "a2p.submitted", { brandSid: res.brandSid, smsConsent: true });

  // (Re)point the number's inbound SMS at the STOP/HELP webhook — provisioning
  // already tries this, but only when APP_URL was public at the time.
  const publicApp = agentBaseUrl();
  if (publicApp) {
    await configureNumberSmsWebhook(shop.twilioNumberSid, `${publicApp}/api/webhooks/twilio/sms`).catch((e) =>
      console.error("sms webhook config failed", e),
    );
  }

  // Poll for approval in the background (does not block go-live).
  await scheduleJob("/api/jobs/a2p-poll", { shopId }, 3 * 60 * 60); // every few hours

  // Completing the step lets the run proceed to go-live.
  await completeUserStep(shop.run.id, "a2p", { submitted: true, brandSid: res.brandSid });
}

/** Owner chose to skip texting for now — proceed to go-live without SMS. */
export async function skipA2P(shopId: string) {
  const shop = await prisma.shop.findUnique({ where: { id: shopId }, include: { run: true } });
  if (!shop?.run) throw new Error("Setup not ready.");
  await prisma.shop.update({ where: { id: shopId }, data: { a2pStatus: "not_started" } });
  await logAudit(shopId, null, "a2p.skipped", {});
  await completeUserStep(shop.run.id, "a2p", { skipped: true });
}

/** QStash callback: check approval and flip features / notify, or re-poll. */
export async function pollA2P(shopId: string) {
  const shop = await prisma.shop.findUnique({ where: { id: shopId }, include: { owner: true } });
  if (!shop?.a2pBrandSid || shop.a2pStatus === "approved") return;

  // Brand AND campaign must both check out — see getA2PStatus. Passing the
  // messaging service is what lets it verify the campaign.
  const status = await getA2PStatus(shop.a2pBrandSid, shop.a2pMessagingServiceSid);
  if (status === "approved") {
    await prisma.shop.update({ where: { id: shopId }, data: { a2pStatus: "approved" } });
    await logAudit(shopId, null, "a2p.approved", {});
    await sendEmail({
      to: shop.owner.email,
      subject: `Texting is now on for ${shop.businessName}`,
      text: `Good news — your business texting registration was approved. Missed-call text-back and SMS confirmations are now active.`,
      html: `<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#0f172a"><h1 style="font-size:20px">Texting is on ✅</h1><p style="color:#475569">Your texting registration was approved. Missed-call text-back and SMS confirmations are now active for ${shop.businessName}.</p></div>`,
    });
  } else if (status === "failed") {
    await prisma.shop.update({ where: { id: shopId }, data: { a2pStatus: "failed" } });
    await notifyAdmins("A2P registration failed", `Shop ${shop.businessName} (${shopId}) A2P brand ${shop.a2pBrandSid} was rejected.`);
  } else {
    // Still pending — check again later.
    await scheduleJob("/api/jobs/a2p-poll", { shopId }, 3 * 60 * 60);
  }
}
