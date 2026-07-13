import "server-only";
import crypto from "node:crypto";
import type { Shop } from "@prisma/client";
import { prisma } from "./db";
import { secretEquals } from "./secure";
import { issueDeviceToken, verifyDeviceToken } from "./mobileToken";

export { issueDeviceToken, verifyDeviceToken } from "./mobileToken";

// ---------------------------------------------------------------------------
// Owner mobile app auth. Native clients can't use better-auth's cookie sessions,
// so this is a parallel token path:
//   1. email-OTP: a 6-digit code emailed to a known owner (no account
//      enumeration), single-use, expiring, attempt-limited.
//   2. On verify, mint a DeviceToken row and hand back a bearer token of the form
//      `${deviceId}.${hmac(mobile:${deviceId})}`. The HMAC (AUTH_SECRET) makes it
//      unforgeable; the DB row makes it revocable (delete row = revoke device).
// The token carries no user data — the userId is resolved from the DeviceToken
// row on every request, so a revoked/rotated device is enforced server-side.
// ---------------------------------------------------------------------------

export interface MobileAuth {
  user: { id: string; email: string; name: string | null };
  shop: Shop | null;
  deviceId: string;
}

/** Authenticate a mobile request from its `Authorization: Bearer` token. Returns
 *  null when the header is absent, malformed, forged, or the device was revoked. */
export async function requireMobileUser(req: Request): Promise<MobileAuth | null> {
  const header = req.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token) return null;

  const deviceId = verifyDeviceToken(token);
  if (!deviceId) return null;

  const device = await prisma.deviceToken.findUnique({ where: { id: deviceId }, include: { user: true } });
  if (!device) return null; // revoked / unknown

  // Touch last-seen without blocking the request.
  prisma.deviceToken.update({ where: { id: deviceId }, data: { lastSeenAt: new Date() } }).catch(() => {});

  const shop = await prisma.shop.findFirst({ where: { ownerId: device.userId }, orderBy: { createdAt: "asc" } });
  return { user: { id: device.user.id, email: device.user.email, name: device.user.name }, shop, deviceId };
}

// --- Email OTP -------------------------------------------------------------

const CODE_TTL_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;

const hashCode = (code: string) => crypto.createHash("sha256").update(code).digest("hex");

/** Create + email a 6-digit code IF the email belongs to a user. Resolves the
 *  same way regardless, so it never reveals whether an account exists. */
export async function requestMobileCode(email: string): Promise<void> {
  const normalized = email.trim().toLowerCase();
  const user = await prisma.user.findUnique({ where: { email: normalized } });
  if (!user) return; // silent — no account enumeration

  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
  await prisma.mobileAuthCode.deleteMany({ where: { email: normalized } });
  await prisma.mobileAuthCode.create({
    data: { email: normalized, codeHash: hashCode(code), expiresAt: new Date(Date.now() + CODE_TTL_MS) },
  });

  const { sendMobileCodeEmail } = await import("./email");
  await sendMobileCodeEmail(normalized, code);
}

export type VerifyResult =
  | { ok: true; token: string; deviceId: string; userId: string }
  | { ok: false; reason: "invalid" | "expired" | "locked" };

/** Verify a code and, on success, mint a device token. Failure reasons are kept
 *  coarse on purpose (don't help a guesser distinguish states). */
export async function verifyMobileCode(
  email: string,
  code: string,
  opts?: { platform?: string | null; pushToken?: string | null },
): Promise<VerifyResult> {
  const normalized = email.trim().toLowerCase();
  const rec = await prisma.mobileAuthCode.findFirst({ where: { email: normalized }, orderBy: { createdAt: "desc" } });
  if (!rec) return { ok: false, reason: "invalid" };
  if (rec.expiresAt.getTime() < Date.now()) {
    await prisma.mobileAuthCode.deleteMany({ where: { email: normalized } });
    return { ok: false, reason: "expired" };
  }
  if (rec.attempts >= MAX_ATTEMPTS) return { ok: false, reason: "locked" };

  if (!secretEquals(rec.codeHash, hashCode(code))) {
    await prisma.mobileAuthCode.update({ where: { id: rec.id }, data: { attempts: { increment: 1 } } });
    return { ok: false, reason: "invalid" };
  }

  const user = await prisma.user.findUnique({ where: { email: normalized } });
  if (!user) return { ok: false, reason: "invalid" };

  await prisma.mobileAuthCode.deleteMany({ where: { email: normalized } });
  const device = await prisma.deviceToken.create({
    data: { userId: user.id, platform: opts?.platform ?? null, pushToken: opts?.pushToken ?? null },
  });
  return { ok: true, token: issueDeviceToken(device.id), deviceId: device.id, userId: user.id };
}
