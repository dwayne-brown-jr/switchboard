import { signPayload, verifyPayload } from "./secure";

// Pure codec for the owner-app device bearer token — no DB, no server-only, so
// it's unit-testable. The token is `${deviceId}.${hmac(mobile:${deviceId})}`:
// the HMAC (AUTH_SECRET) makes it unforgeable; existence/revocation is enforced
// against the DeviceToken row separately (lib/mobileAuth).

/** Mint the opaque bearer token for a device id. */
export function issueDeviceToken(deviceId: string): string {
  return `${deviceId}.${signPayload(`mobile:${deviceId}`)}`;
}

/** Validate a token's HMAC and return its device id, or null if malformed/forged. */
export function verifyDeviceToken(token: string): string | null {
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const deviceId = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  if (!verifyPayload(`mobile:${deviceId}`, sig)) return null;
  return deviceId;
}
