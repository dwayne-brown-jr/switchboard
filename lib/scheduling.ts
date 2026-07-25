import { naiveLocalToUtc } from "./datetime";
import type { ShopConfig } from "./schemas";

// Switchboard owns its scheduling. Availability for a shop is computed from that
// shop's configured business hours minus that shop's OWN bookings — never a
// shared external calendar. This makes cross-shop isolation structural: the busy
// intervals passed in only ever belong to one shop, so one shop's booking can
// never block another's slot (the failure mode of the old single-Cal.com-user
// model). All wall-clock reasoning is done in the shop's IANA timezone; the
// returned/checked instants are UTC.
//
// The model is capacity- and duration-aware so it fits real businesses:
//  - capacity   = how many jobs can run at once (1 washer vs 3 bays)
//  - durationMin = how long THIS appointment takes (a 3-hr detail vs a 30-min oil change)
//  - bufferMin  = required gap around each job (travel time for mobile businesses)
// A candidate time is open only if the appointment fits inside open hours AND
// fewer than `capacity` existing jobs overlap it (each expanded by the buffer).

/** Default appointment length when the shop/service doesn't specify one. */
export const DEFAULT_DURATION_MIN = 60;
/** Default start-time granularity slots are generated on. */
export const DEFAULT_STEP_MIN = 30;
/** How far ahead check_availability looks by default. */
export const HORIZON_DAYS = 14;

type Hours = ShopConfig["hours"];
export type Busy = { startUtc: Date; endUtc: Date };

/** Capacity/duration/buffer/granularity knobs shared by generation + validation. */
export type SchedulingParams = {
  durationMin?: number;
  capacity?: number;
  bufferMin?: number;
  stepMin?: number;
};

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

const clampInt = (v: number | undefined, dflt: number, min: number) =>
  Number.isFinite(v) && (v as number) >= min ? Math.floor(v as number) : dflt;

/**
 * How many existing jobs overlap the interval [startMs, endMs) — each existing
 * booking expanded by `bufferMs` on both sides so a new job can't butt right up
 * against another (travel/turnaround time). If this is < capacity, the interval
 * still has room.
 */
function concurrentCount(startMs: number, endMs: number, busy: Busy[], bufferMs: number): number {
  let n = 0;
  for (const b of busy) {
    const bStart = b.startUtc.getTime() - bufferMs;
    const bEnd = b.endUtc.getTime() + bufferMs;
    if (startMs < bEnd && endMs > bStart) n++;
  }
  return n;
}

export type SlotResult = { data: Record<string, { start: string }[]> };

/**
 * Open appointment slots grouped by the shop-local date (mirrors the shape the
 * agent tool relayed from Cal.com's slots endpoint, so downstream is unchanged).
 * Each `start` is a UTC ISO instant. A start is included only when the whole
 * appointment [start, start+duration) fits inside an open hours window, is in the
 * future, and fewer than `capacity` existing jobs overlap it.
 */
export function generateOpenSlots(opts: {
  hours: Hours;
  timezone: string | null | undefined;
  busy: Busy[];
  now: Date;
  days?: number;
} & SchedulingParams): SlotResult {
  const { hours, busy, now } = opts;
  const tz = opts.timezone || "America/Chicago";
  const days = opts.days ?? HORIZON_DAYS;
  const duration = clampInt(opts.durationMin, DEFAULT_DURATION_MIN, 1);
  const capacity = clampInt(opts.capacity, 1, 1);
  const bufferMs = clampInt(opts.bufferMin, 0, 0) * 60_000;
  const step = clampInt(opts.stepMin, DEFAULT_STEP_MIN, 1);
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
    // The whole appointment must finish by close.
    for (let cur = openMin; cur + duration <= closeMin; cur += step) {
      const naive = `${dateStr}T${pad(Math.floor(cur / 60))}:${pad(cur % 60)}:00`;
      const startUtc = new Date(naiveLocalToUtc(naive, tz));
      if (Number.isNaN(startUtc.getTime())) continue;
      const startMs = startUtc.getTime();
      if (startMs <= now.getTime()) continue;
      if (concurrentCount(startMs, startMs + duration * 60_000, busy, bufferMs) >= capacity) continue;
      (data[dateStr] ??= []).push({ start: startUtc.toISOString() });
    }
  }
  return { data };
}

/**
 * Is `startUtc` a bookable slot for this shop? True only when the whole
 * appointment fits inside an open hours window for its local weekday, is in the
 * future, and fewer than `capacity` existing jobs overlap it. Used to validate an
 * agent-confirmed time before writing.
 */
export function isSlotAvailable(opts: {
  hours: Hours;
  timezone: string | null | undefined;
  busy: Busy[];
  startUtc: Date;
  now: Date;
} & SchedulingParams): boolean {
  const { hours, busy, startUtc, now } = opts;
  const tz = opts.timezone || "America/Chicago";
  const duration = clampInt(opts.durationMin, DEFAULT_DURATION_MIN, 1);
  const capacity = clampInt(opts.capacity, 1, 1);
  const bufferMs = clampInt(opts.bufferMin, 0, 0) * 60_000;
  if (Number.isNaN(startUtc.getTime()) || startUtc.getTime() <= now.getTime()) return false;

  const lp = localParts(startUtc, tz);
  const dayHours = hours[lp.dayKey];
  if (!dayHours || dayHours.closed) return false;
  const openMin = parseHHMM(dayHours.open);
  const closeMin = parseHHMM(dayHours.close);
  if (openMin === null || closeMin === null) return false;

  const slotStartMin = lp.hour * 60 + lp.minute;
  if (slotStartMin < openMin || slotStartMin + duration > closeMin) return false;
  const startMs = startUtc.getTime();
  return concurrentCount(startMs, startMs + duration * 60_000, busy, bufferMs) < capacity;
}

/** Resolve the effective duration for a named service (per-service override → shop default). */
export function serviceDuration(config: ShopConfig, service?: string | null): number {
  const dflt = clampInt(config.default_duration_min, DEFAULT_DURATION_MIN, 1);
  const name = (service ?? "").trim().toLowerCase();
  if (name) {
    const match = config.services.find((s) => s.service.trim().toLowerCase() === name);
    if (match?.durationMin) return clampInt(match.durationMin, dflt, 1);
  }
  return dflt;
}
