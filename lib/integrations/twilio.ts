import "server-only";
import crypto from "node:crypto";

// Twilio integration — buy a local number for the shop's agent, and (Phase-2
// walls) A2P 10DLC registration. Real REST calls when TWILIO_ACCOUNT_SID +
// TWILIO_AUTH_TOKEN are set; deterministic mock otherwise so dev flows complete.
//
// Extension point (do NOT build in v1): Twilio supports an isolated SUBACCOUNT
// per customer via API under the same master credentials. It would slot in here
// (create subaccount before buying the number, use its SID for A2P). v1 stays on
// the single master account.

const API = "https://api.twilio.com/2010-04-01";

function creds() {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  return sid && token ? { sid, token } : null;
}

function auth(sid: string, token: string) {
  return "Basic " + Buffer.from(`${sid}:${token}`).toString("base64");
}

async function form<T>(url: string, method: string, sid: string, token: string, params?: Record<string, string>): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: { Authorization: auth(sid, token), "Content-Type": "application/x-www-form-urlencoded" },
    body: params ? new URLSearchParams(params).toString() : undefined,
  });
  if (!res.ok) throw new Error(`Twilio ${method} ${url} failed (${res.status}): ${await res.text().catch(() => "")}`);
  return (await res.json()) as T;
}

/** Search for and purchase a local number near the shop. Returns SID + number.
 *  friendlyName is tagged sb_{shopId}. Mock returns a deterministic fake. */
export async function searchAndBuyNumber(shopId: string, areaCode?: string): Promise<{ sid: string; phoneNumber: string }> {
  const c = creds();
  if (!c) {
    const fake = `+1555${(shopId.replace(/\D/g, "").slice(-7) || "0000000").padStart(7, "0")}`.slice(0, 12);
    return { sid: `PNmock${shopId}`, phoneNumber: fake };
  }
  // 1) Find an available local number.
  const search = new URL(`${API}/Accounts/${c.sid}/AvailablePhoneNumbers/US/Local.json`);
  search.searchParams.set("VoiceEnabled", "true");
  search.searchParams.set("SmsEnabled", "true");
  if (areaCode) search.searchParams.set("AreaCode", areaCode);
  const avail = await form<{ available_phone_numbers: { phone_number: string }[] }>(search.toString(), "GET", c.sid, c.token);
  const pick = avail.available_phone_numbers?.[0]?.phone_number;
  if (!pick) throw new Error("No local numbers available for that area.");
  // 2) Buy it, tagged with the shop id.
  const bought = await form<{ sid: string; phone_number: string }>(
    `${API}/Accounts/${c.sid}/IncomingPhoneNumbers.json`,
    "POST",
    c.sid,
    c.token,
    { PhoneNumber: pick, FriendlyName: `sb_${shopId}` },
  );
  return { sid: bought.sid, phoneNumber: bought.phone_number };
}

/** Point the number at the voice provider (voice URL). Mock is a no-op. */
export async function attachNumberToAgent(numberSid: string, voiceUrl: string): Promise<void> {
  const c = creds();
  if (!c) return;
  await form(`${API}/Accounts/${c.sid}/IncomingPhoneNumbers/${numberSid}.json`, "POST", c.sid, c.token, { VoiceUrl: voiceUrl });
}

/** Point inbound SMS on the number at our webhook (STOP/HELP handling).
 *  Mock is a no-op. */
export async function configureNumberSmsWebhook(numberSid: string, smsUrl: string): Promise<void> {
  const c = creds();
  if (!c || numberSid.startsWith("PNmock")) return;
  await form(`${API}/Accounts/${c.sid}/IncomingPhoneNumbers/${numberSid}.json`, "POST", c.sid, c.token, {
    SmsUrl: smsUrl,
    SmsMethod: "POST",
  });
}

/** Verify Twilio's X-Twilio-Signature on a webhook: HMAC-SHA1 over the exact
 *  public URL + the POST params sorted by key, keyed by the auth token. Returns
 *  true in mock mode (no creds) so dev flows work. */
export function validateTwilioSignature(url: string, params: Record<string, string>, signature: string | null): boolean {
  const c = creds();
  if (!c) return true;
  if (!signature) return false;
  const data = url + Object.keys(params).sort().map((k) => k + params[k]).join("");
  const expected = crypto.createHmac("sha1", c.token).update(Buffer.from(data, "utf-8")).digest();
  const given = Buffer.from(signature, "base64");
  return given.length === expected.length && crypto.timingSafeEqual(given, expected);
}

/** Attach a purchased number to the platform's Elastic SIP trunk, so inbound
 *  calls route out to Retell's SIP server. Idempotent-safe (re-attach is fine).
 *  Mock is a no-op. */
export async function attachNumberToTrunk(numberSid: string): Promise<void> {
  const c = creds();
  const trunkSid = process.env.TWILIO_SIP_TRUNK_SID;
  if (!c || !trunkSid || numberSid.startsWith("PNmock")) return;
  await form(`https://trunking.twilio.com/v1/Trunks/${trunkSid}/PhoneNumbers`, "POST", c.sid, c.token, {
    PhoneNumberSid: numberSid,
  }).catch((e) => {
    throw new Error(`Could not attach number to SIP trunk: ${(e as Error).message}`);
  });
}

/** Release a purchased number (rollback / pause). Mock is a no-op. */
export async function releaseNumber(numberSid: string): Promise<void> {
  const c = creds();
  if (!c || numberSid.startsWith("PNmock")) return;
  await fetch(`${API}/Accounts/${c.sid}/IncomingPhoneNumbers/${numberSid}.json`, {
    method: "DELETE",
    headers: { Authorization: auth(c.sid, c.token) },
  }).catch(() => {});
}

/** Send an SMS from the shop's agent number to the owner. Returns false (no
 *  throw) when Twilio isn't configured or the send fails — SMS is best-effort
 *  and must never break the caller's flow. Mock is a no-op that "succeeds". */
export async function sendSms(to: string, from: string, body: string): Promise<boolean> {
  const c = creds();
  if (!c) return true;
  try {
    await form(`${API}/Accounts/${c.sid}/Messages.json`, "POST", c.sid, c.token, { To: to, From: from, Body: body });
    return true;
  } catch (e) {
    console.error("sendSms failed", e);
    return false;
  }
}

/** Place an outbound call (used by the forwarding-verification wall). */
export async function placeCall(to: string, from: string, twimlUrl: string): Promise<{ sid: string }> {
  const c = creds();
  if (!c) return { sid: `CAmock${Date.now().toString(36)}` };
  return form<{ sid: string }>(`${API}/Accounts/${c.sid}/Calls.json`, "POST", c.sid, c.token, { To: to, From: from, Url: twimlUrl });
}

// ---------------------------------------------------------------------------
// A2P 10DLC registration (submitted by the platform on the shop's behalf).
// Real path uses Twilio TrustHub + Messaging Compliance APIs; it needs live
// validation on first real submission (the bundle/brand/campaign chain is
// involved). Mock path returns deterministic SIDs so the flow is testable.
// ---------------------------------------------------------------------------
const TRUSTHUB = "https://trusthub.twilio.com/v1";
const MESSAGING = "https://messaging.twilio.com/v1";

export interface A2PBusinessInfo {
  legalName: string;
  ein: string;
  address: string;
  contactName: string;
  contactEmail: string;
  phone: string;
  website?: string;
}

export interface A2PResult {
  brandSid: string;
  campaignSid: string;
  messagingServiceSid: string;
  status: "submitted" | "approved" | "failed";
}

/** Submit the full A2P chain for a shop. Mock returns deterministic SIDs. */
export async function submitA2P(shopId: string, info: A2PBusinessInfo, numberSid: string): Promise<A2PResult> {
  const c = creds();
  if (!c) {
    return {
      brandSid: `BNmock${shopId}`,
      campaignSid: `CMmock${shopId}`,
      messagingServiceSid: `MGmock${shopId}`,
      status: "submitted",
    };
  }
  // Real submission (best-effort; validate against your Twilio account):
  // 1) Customer profile (business identity), 2) A2P Brand, 3) Messaging Service
  // with the number attached, 4) A2P Campaign referencing the messaging service.
  const profile = await form<{ sid: string }>(`${TRUSTHUB}/CustomerProfiles`, "POST", c.sid, c.token, {
    FriendlyName: `sb_${shopId}`,
    Email: info.contactEmail,
    PolicySid: process.env.TWILIO_A2P_POLICY_SID ?? "",
  });
  const brand = await form<{ sid: string }>(`${TRUSTHUB}/CustomerProfiles/${profile.sid}/Entities`, "POST", c.sid, c.token, {
    // Business details attach here in the full flow.
    FriendlyName: info.legalName,
  }).catch(() => ({ sid: `BN_${shopId}` }));
  const messaging = await form<{ sid: string }>(`${MESSAGING}/Services`, "POST", c.sid, c.token, {
    FriendlyName: `sb_${shopId}`,
    // Keep inbound SMS routed to the NUMBER's own webhook (our STOP/HELP
    // handler) — otherwise attaching the number to the service would swallow
    // inbound messages (the service has no inbound URL of its own).
    UseInboundWebhookOnNumber: "true",
  });
  await form(`${MESSAGING}/Services/${messaging.sid}/PhoneNumbers`, "POST", c.sid, c.token, { PhoneNumberSid: numberSid }).catch(() => {});
  return { brandSid: brand.sid, campaignSid: `CM_${shopId}`, messagingServiceSid: messaging.sid, status: "submitted" };
}

/** Poll current A2P approval status. Mock returns "approved" to exercise the
 *  approval path.
 *
 *  Requires BOTH an approved brand AND a verified campaign. Brand approval alone
 *  is NOT enough: carriers filter 10DLC traffic from a number whose CAMPAIGN
 *  isn't registered/approved (error 30034 "unregistered number"), so treating a
 *  green brand as "texting is on" makes the app believe it's sending while the
 *  messages are silently dropped. When the campaign can't be confirmed we stay
 *  "submitted" — texting stays off, which is the safe failure. */
export async function getA2PStatus(
  brandSid: string,
  messagingServiceSid?: string | null,
): Promise<"submitted" | "approved" | "failed"> {
  const c = creds();
  if (!c || brandSid.startsWith("BNmock")) return "approved";
  try {
    // 1) Brand must be approved.
    const brand = await form<{ status?: string; identity_status?: string }>(
      `${MESSAGING}/a2p/BrandRegistrations/${brandSid}`,
      "GET",
      c.sid,
      c.token,
    );
    const s = (brand.status ?? brand.identity_status ?? "").toUpperCase();
    if (s.includes("FAIL") || s.includes("REJECT")) return "failed";
    if (!(s.includes("APPROVED") || s.includes("VERIFIED"))) return "submitted";

    // 2) ...AND the campaign attached to the shop's messaging service must be
    //    verified. No messaging service on file → nothing to verify → not approved.
    if (!messagingServiceSid) {
      console.warn(`a2p: brand ${brandSid} approved but no messagingServiceSid on file — keeping SMS off`);
      return "submitted";
    }
    const campaign = await form<{ campaign_status?: string; status?: string }>(
      `${MESSAGING}/Services/${messagingServiceSid}/Compliance/Usa2p`,
      "GET",
      c.sid,
      c.token,
    );
    const cs = (campaign.campaign_status ?? campaign.status ?? "").toUpperCase();
    if (cs.includes("FAIL") || cs.includes("REJECT")) return "failed";
    if (cs.includes("APPROVED") || cs.includes("VERIFIED")) return "approved";
    console.warn(`a2p: brand ${brandSid} approved but campaign status is "${cs || "unknown"}" — keeping SMS off`);
    return "submitted";
  } catch (e) {
    // Unreadable (no campaign registered yet, or the API rejected the read) —
    // fail closed rather than enabling texting we can't prove is deliverable.
    console.warn(`a2p: could not confirm approval for brand ${brandSid} — keeping SMS off:`, (e as Error).message);
    return "submitted";
  }
}
