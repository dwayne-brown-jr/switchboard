import crypto from "node:crypto";
import { prisma } from "../db";
import { isPaying } from "../stripe";
import { defaultVoiceProvider } from "../integrations/voice";
import { createEventTypes } from "../integrations/calcom";
import { searchAndBuyNumber, attachNumberToTrunk } from "../integrations/twilio";
import { importPhoneNumber } from "../integrations/retell";
import { agentFunctions, agentWebhookUrl, agentBaseUrl } from "../integrations/agentTools";
import type { ShopConfig } from "../schemas";
import { type AutoHandler, done, failed } from "./types";

// All provisioning steps are IDEMPOTENT: they check the stored external id on
// the shop first and return early if present, so a retry never double-creates.
// Every external id is persisted immediately after creation.

async function approvedVersion(shopId: string) {
  return (
    (await prisma.agentVersion.findFirst({ where: { shopId, status: "approved" }, orderBy: { createdAt: "desc" } })) ??
    (await prisma.agentVersion.findFirst({ where: { shopId }, orderBy: { createdAt: "desc" } }))
  );
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

// 7 — provision_voice
export const provisionVoiceHandler: AutoHandler = async ({ shop }) => {
  const blocked = gate(shop.subStatus);
  if (blocked) return failed(blocked);
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
  });

  await prisma.shop.update({ where: { id: shop.id }, data: { agentProvider: provider.name, agentId } });
  return done({ agentId, provider: provider.name });
};

// 8 — provision_calendar
export const provisionCalendarHandler: AutoHandler = async ({ shop }) => {
  const blocked = gate(shop.subStatus);
  if (blocked) return failed(blocked);
  if (shop.calEventTypeMap) return done({ reused: true });

  const version = await approvedVersion(shop.id);
  if (!version) return failed("No approved version for calendar setup.");
  const config = version.config as unknown as ShopConfig;

  const map = await createEventTypes(shop.id, config);
  await prisma.shop.update({ where: { id: shop.id }, data: { calEventTypeMap: map } });
  return done({ eventTypes: Object.keys(map).length });
};

// 9 — provision_number
export const provisionNumberHandler: AutoHandler = async ({ shop }) => {
  const blocked = gate(shop.subStatus);
  if (blocked) return failed(blocked);
  if (shop.twilioNumberSid && shop.agentNumber) return done({ number: shop.agentNumber, reused: true });

  const { sid, phoneNumber } = await searchAndBuyNumber(shop.id, areaCodeFrom(shop.businessNumber));
  // Persist immediately so a retry never buys a second number.
  await prisma.shop.update({ where: { id: shop.id }, data: { twilioNumberSid: sid, agentNumber: phoneNumber } });

  // Route inbound calls to the agent: attach the number to the platform SIP
  // trunk, then import it into Retell bound to this shop's agent. When the trunk
  // isn't configured (dev/mock), skip — the number is still bought.
  const termUri = process.env.TWILIO_SIP_TERMINATION_URI;
  if (termUri && shop.agentId && shop.agentProvider === "retell") {
    await attachNumberToTrunk(sid);
    await importPhoneNumber({
      phoneNumber,
      terminationUri: termUri,
      username: process.env.TWILIO_SIP_USERNAME ?? "",
      password: process.env.TWILIO_SIP_PASSWORD ?? "",
      agentId: shop.agentId,
    });
  }
  return done({ number: phoneNumber, sid, voiceRouted: !!termUri });
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
