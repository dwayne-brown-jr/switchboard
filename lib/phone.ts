// Normalize a US-style phone number to E.164 (+15551234567), which Retell's
// transfer_destination and Twilio require. Returns null when it can't be
// confidently normalized (so callers skip rather than send a bad number).
export function toE164(raw?: string | null): string | null {
  if (!raw) return null;
  const t = raw.trim();
  if (/^\+\d{8,15}$/.test(t)) return t; // already E.164
  const digits = t.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return null;
}
