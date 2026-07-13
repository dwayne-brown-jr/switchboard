import { naiveLocalToUtc } from "./datetime";
import type { ShopConfig } from "./schemas";

// Switchboard owns its scheduling. Availability for a shop is computed from that
// shop's configured business hours minus that shop's OWN bookings — never a
// shared external calendar. This makes cross-shop isolation structural: the busy
// intervals passed in only ever belong to one shop, so one shop's booking can
// never block another's slot (the failure mode of the old single-Cal.com-user
// model). All wall-clock reasoning is done in the shop's IANA timezone; the
// returned/checked instants are UTC.

/** Fixed appointment length, in minutes (matches the single 60-min slot model). */
export const SLOT_MINUTES = 60;
/** How far ahead check_availability looks by default. */
export const HORIZON_DAYS = 14;

type Hours = ShopConfig["hours"];
export type Busy = { startUtc: Date; endUtc: Date };

// hoursSchema keys are lowercase 3-letter day names; JS getUTCDay() is 0=Sun..6=Sat.
const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

/** Wall-clock parts of `date` as seen in `timeZone` (DST-correct). */
function localParts(date: Date, timeZone: string) {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
  const p = Object.fromEntries(dtf.formatToParts(date).map((x) => [x.type, x.value]));
  const short = String(p.weekday).toLowerCase().slice(0, 3);
  return {
    year: +p.year,
    month: +p.month,
    day: +p.day,
    // Intl returns "24" for midnight in hour12:false — normalize to 0.
    hour: +p.hour % 24,
    minute: +p.minute,
    dayKey: short as (typeof DAY_KEYS)[number],
  };
}

/** "HH:mm" → minutes past midnight, or null if malformed. */
function parseHHMM(s: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s.trim());
  if (!m) return null;
  const h = +m[1];
  const min = +m[2];
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

const pad = (n: number) => String(n).padStart(2, "0");

function overlapsBusy(startUtc: Date, slotMinutes: number, busy: Busy[]): boolean {
  const end = startUtc.getTime() + slotMinutes * 60_000;
  return busy.some((b) => startUtc.getTime() < b.endUtc.getTime() && end > b.startUtc.getTime());
}

export type SlotResult = { data: Record<string, { start: string }[]> };

/**
 * Open appointment slots grouped by the shop-local date (mirrors the shape the
 * agent tool relayed from Cal.com's slots endpoint, so downstream is unchanged).
 * Each `start` is a UTC ISO instant. Past slots and slots overlapping a busy
 * interval are excluded.
 */
export function generateOpenSlots(opts: {
  hours: Hours;
  timezone: string | null | undefined;
  busy: Busy[];
  now: Date;
  days?: number;
  slotMinutes?: number;
}): SlotResult {
  const { hours, busy, now } = opts;
  const tz = opts.timezone || "America/Chicago";
  const days = opts.days ?? HORIZON_DAYS;
  const slot = opts.slotMinutes ?? SLOT_MINUTES;
  const data: Record<string, { start: string }[]> = {};

  const today = localParts(now, tz);
  for (let offset = 0; offset < days; offset++) {
    // Roll the local calendar date forward via UTC arithmetic on the calendar
    // numbers (avoids DST hour-shifts crossing a midnight boundary); read the
    // intended date + weekday straight back from the UTC getters.
    const cal = new Date(Date.UTC(today.year, today.month - 1, today.day + offset));
    const y = cal.getUTCFullYear();
    const mo = cal.getUTCMonth() + 1;
    const d = cal.getUTCDate();
    const dayHours = hours[DAY_KEYS[cal.getUTCDay()]];
    if (!dayHours || dayHours.closed) continue;
    const openMin = parseHHMM(dayHours.open);
    const closeMin = parseHHMM(dayHours.close);
    if (openMin === null || closeMin === null || closeMin <= openMin) continue;

    const dateStr = `${y}-${pad(mo)}-${pad(d)}`;
    for (let cur = openMin; cur + slot <= closeMin; cur += slot) {
      const naive = `${dateStr}T${pad(Math.floor(cur / 60))}:${pad(cur % 60)}:00`;
      const startUtc = new Date(naiveLocalToUtc(naive, tz));
      if (Number.isNaN(startUtc.getTime())) continue;
      if (startUtc.getTime() <= now.getTime()) continue;
      if (overlapsBusy(startUtc, slot, busy)) continue;
      (data[dateStr] ??= []).push({ start: startUtc.toISOString() });
    }
  }
  return { data };
}

/**
 * Is `startUtc` a bookable slot for this shop? True only when it falls inside an
 * open hours window for its local weekday, is in the future, and doesn't overlap
 * an existing booking. Used to validate an agent-confirmed time before writing.
 */
export function isSlotAvailable(opts: {
  hours: Hours;
  timezone: string | null | undefined;
  busy: Busy[];
  startUtc: Date;
  now: Date;
  slotMinutes?: number;
}): boolean {
  const { hours, busy, startUtc, now } = opts;
  const tz = opts.timezone || "America/Chicago";
  const slot = opts.slotMinutes ?? SLOT_MINUTES;
  if (Number.isNaN(startUtc.getTime()) || startUtc.getTime() <= now.getTime()) return false;

  const lp = localParts(startUtc, tz);
  const dayHours = hours[lp.dayKey];
  if (!dayHours || dayHours.closed) return false;
  const openMin = parseHHMM(dayHours.open);
  const closeMin = parseHHMM(dayHours.close);
  if (openMin === null || closeMin === null) return false;

  const slotStartMin = lp.hour * 60 + lp.minute;
  if (slotStartMin < openMin || slotStartMin + slot > closeMin) return false;
  return !overlapsBusy(startUtc, slot, busy);
}
