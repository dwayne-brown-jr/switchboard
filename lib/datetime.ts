// Timezone helpers for booking. The voice LLM often emits a NAIVE local time
// ("2026-07-15T14:00:00", no offset). Cal.com treats a naive `start` as UTC, so
// without correction a 2 PM appointment for a US shop lands 5–8 hours off. We
// interpret the naive wall-time in the shop's IANA zone and return a correct
// UTC instant.

/** True if the ISO string already carries a timezone (Z or ±hh:mm). */
export function hasOffset(iso: string): boolean {
  return /(Z|[+-]\d{2}:?\d{2})$/.test(iso.trim());
}

/** Minutes east of UTC for `date` in `timeZone` (handles DST). */
function offsetMinutes(date: Date, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = Object.fromEntries(dtf.formatToParts(date).map((p) => [p.type, p.value]));
  const asIfUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour % 24, +parts.minute, +parts.second);
  return (asIfUtc - date.getTime()) / 60000;
}

/**
 * Convert a naive local datetime to a UTC ISO instant, interpreting the wall
 * time in `timeZone`. If `iso` already has an offset, or the timezone is
 * missing/invalid, the input is returned unchanged.
 */
export function naiveLocalToUtc(iso: string, timeZone: string | null | undefined): string {
  const s = (iso ?? "").trim();
  if (!s || !timeZone || hasOffset(s)) return s;
  try {
    const asUtc = new Date(`${s}Z`);
    if (Number.isNaN(asUtc.getTime())) return s;
    const off = offsetMinutes(asUtc, timeZone);
    return new Date(asUtc.getTime() - off * 60000).toISOString();
  } catch {
    return s;
  }
}
