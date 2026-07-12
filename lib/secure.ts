import crypto from "node:crypto";

/**
 * Constant-time string comparison for secrets (ingest secrets, bearer tokens).
 * A plain `a !== b` short-circuits on the first differing byte, leaking the
 * secret's length and a byte-by-byte timing oracle. This always compares the
 * full length and returns false for any length mismatch without early exit.
 *
 * Both values are hashed to a fixed-length digest first so timingSafeEqual
 * never throws on differing input lengths (it requires equal-length buffers).
 */
export function secretEquals(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  const ha = crypto.createHash("sha256").update(a).digest();
  const hb = crypto.createHash("sha256").update(b).digest();
  // Digests are always 32 bytes, so timingSafeEqual is safe. The hash equality
  // implies string equality (modulo an astronomically unlikely collision).
  return crypto.timingSafeEqual(ha, hb);
}

/** Sign a payload with the app secret (unforgeable one-click links, e.g. email
 *  unsubscribe). Returns a short hex tag; verify with the constant-time compare. */
export function signPayload(payload: string): string {
  const secret = process.env.AUTH_SECRET || "dev-insecure-secret";
  return crypto.createHmac("sha256", secret).update(payload).digest("hex").slice(0, 32);
}

export function verifyPayload(payload: string, sig: string | null | undefined): boolean {
  return secretEquals(signPayload(payload), sig ?? "");
}
