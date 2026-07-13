// Normalize a US-style phone number to E.164 (+15551234567), which Retell's
// transfer_destination and Twilio require. Returns null when it can't be
// confidently normalized (so callers skip rather than send a bad number).
export function toE164(raw?: string | null): string | null {
  if (!raw) return null;
  // Strip to digits FIRST and apply US rules — so a malformed "+4106934140"
  // (a US number that's missing its country code) becomes "+14106934140",
  // rather than being trusted as-is just because it starts with "+".
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`; // US local → +1XXXXXXXXXX
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`; // US with country code
  // Otherwise accept an already-valid non-US E.164 (10/11-digit cases handled above).
  const t = raw.trim();
  if (/^\+\d{8,15}$/.test(t)) return t;
  return null;
}
