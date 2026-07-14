import crypto from "node:crypto";
import { prisma } from "../db";
import { isPaying } from "../stripe";
import { defaultVoiceProvider } from "../integrations/voice";
import { searchAndBuyNumber, attachNumberToTrunk, configureNumberSmsWebhook } from "../integrations/twilio";
import { importPhoneNumber } from "../integrations/retell";
import { agentFunctions, agentWebhookUrl, agentBaseUrl } from "../integrations/agentTools";
import type { ShopConfig } from "../schemas";
import { type AutoHandler, done, failed } from "./types";

// All provisioning steps are IDEMPOTENT: they check the stored external id on
// the shop first and return early if present, so a retry never double-creates.
// Every external id is persisted immediately after creation.

async function approvedVersion(shopId: string) {
  // Only provision a version that genuinely passed QA (approved) or is already
  // live. NEVER fall back to "newest of any status" — that could push a draft
  // that failed the QA gate to the real agent.
  return prisma.agentVersion.findFirst({
    where: { shopId, status: { in: ["approved", "live"] } },
    orderBy: { createdAt: "desc" },
  });
}

function gate(subStatus: string | null): string | null {
  return isPaying(subStatus) ? null : "An active subscription is required before setup can run.";
}

function areaCodeFrom(phone: string | null): string | undefined {
  if (!phone) return undefined;
  const digits = phone.replace(/\D/g, "");
  const local = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
  return local.length >= 10 ? local.slice(0, 3) : undefined;
}

// 6 — provision_voice
// Deliberately NOT subscription-gated: this step runs before the paywall so the
// owner can web-call their own receptionist before paying. Creating the agent
// costs nothing; per-call spend is capped by the webcall rate limit, and the
// paid resources (phone number, calendar) below remain gated.
export const provisionVoiceHandler: AutoHandler = async ({ shop }) => {
  if (shop.agentId) return done({ agentId: shop.agentId, reused: true });

  const version = await approvedVersion(shop.id);
  if (!version) return failed("No approved receptionist version to provision.");
  const config = version.config as unknown as ShopConfig;

  const provider = defaultVoiceProvider();
  // Voice providers (Retell) require PUBLIC https URLs for tools/webhooks — they
  // reject localhost. Attach the native agent tools + call-events webhook (served
  // by this app) whenever APP_URL is a public https URL; otherwise create the
  // agent bare (it can still answer and talk) and wire tools on a later deploy.
  const publicApp = agentBaseUrl() !== null;
  const { agentId } = await provider.createAgent({
    shopId: shop.id,
    systemPrompt: version.systemPrompt,
    voice: config.voice,
    greeting: config.greeting ?? "",
    functions: publicApp ? agentFunctions(shop.id) : [],
    webhookUrl: publicApp ? (agentWebhookUrl(shop.id) ?? "") : "",
    // Live handoff target: the owner's mobile (a real human, and a line that is
    // NOT forwarded to the agent — so a transfer can't loop back).
    transferNumber: shop.ownerMobile ?? undefined,
  });

  await prisma.shop.update({ where: { id: shop.id }, data: { agentProvider: provider.name, agentId } });
  return done({ agentId, provider: provider.name });
};

// 8 — provision_calendar
// Switchboard owns scheduling: availability is computed from the shop's live
// config hours minus the shop's own bookings (lib/scheduling + lib/booking), so
// there's no external calendar to provision. Kept as a pipeline step so the
// onboarding flow/UX is unchanged; it just confirms an approved config exists.
export const provisionCalendarHandler: AutoHandler = async ({ shop }) => {
  const blocked = gate(shop.subStatus);
  if (blocked) return failed(blocked);

  const version = await approvedVersion(shop.id);
  if (!version) return failed("No approved version for calendar setup.");
  return done({ scheduling: "owned" });
};

// 9 — provision_number
export const provisionNumberHandler: AutoHandler = async ({ shop }) => {
  const blocked = gate(shop.subStatus);
  if (blocked) return failed(blocked);
  if (shop.twilioNumberSid && shop.agentNumber) return done({ number: shop.agentNumber, reused: true });

  const { sid, phoneNumber } = await searchAndBuyNumber(shop.id, areaCodeFrom(shop.businessNumber));
  // Persist immediately so a retry never buys a second number.
  await prisma.shop.update({ where: { id: shop.id }, data: { twilioNumberSid: sid, agentNumber: phoneNumber } });

  // Route inbound SMS to our STOP/HELP compliance webhook. Best-effort here
  // (the step's reuse-check would skip it on retry); A2P submit re-runs it.
  const publicApp = agentBaseUrl();
  if (publicApp) {
    await configureNumberSmsWebhook(sid, `${publicApp}/api/webhooks/twilio/sms`).catch((e) => console.error("sms webhook config failed", e));
  }

  // Route inbound calls to the agent: attach the number to the platform SIP
  // trunk, then import it into Retell bound to this shop's agent. When the trunk
  // isn't configured (dev/mock), skip — the number is still bought.
  const termUri = process.env.TWILIO_SIP_TERMINATION_URI;
  const canRoute = !!(termUri && shop.agentId && shop.agentProvider === "retell");
  if (canRoute) {
    await attachNumberToTrunk(sid);
    await importPhoneNumber({
      phoneNumber,
      terminationUri: termUri,
      username: process.env.TWILIO_SIP_USERNAME ?? "",
      password: process.env.TWILIO_SIP_PASSWORD ?? "",
      agentId: shop.agentId!, // canRoute guarantees non-null
    });
  } else if (process.env.NODE_ENV === "production") {
    // A number was purchased but NOT routed to the agent (missing SIP config or
    // agent id) — the shop can still reach "live" but its real number never
    // reaches the AI: a silent half-live shop. Surface it loudly so it's caught.
    const { reportError } = await import("../observability");
    await reportError(
      new Error(`Number ${phoneNumber} bought but not routed to the agent (SIP/agent config missing) — shop ${shop.id} would be half-live`),
      { source: "provisioning", route: "provision_number:unrouted", shopId: shop.id, level: "warn" },
    );
  }
  return done({ number: phoneNumber, sid, voiceRouted: canRoute });
};

// 10 — register_pipeline
export const registerPipelineHandler: AutoHandler = async ({ shop }) => {
  const blocked = gate(shop.subStatus);
  if (blocked) return failed(blocked);

  // Per-shop ingest secret (still used by the legacy /api/ingest/call endpoint).
  // The native agent tools authenticate via a signed token instead, so there's
  // no external registry to POST to anymore — the app IS the broker.
  let ingestSecret = shop.ingestSecret;
  if (!ingestSecret) {
    ingestSecret = crypto.randomBytes(24).toString("hex");
    await prisma.shop.update({ where: { id: shop.id }, data: { ingestSecret } });
  }
  return done({ ingestSecretReady: true });
};
