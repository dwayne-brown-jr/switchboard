import { describe, it, expect } from "vitest";
import { generateOpenSlots, isSlotAvailable, serviceDuration, type Busy } from "./scheduling";
import type { ShopConfig } from "./schemas";

// Mon–Fri 09:00–17:00, weekend closed.
const HOURS: ShopConfig["hours"] = {
  mon: { open: "09:00", close: "17:00", closed: false },
  tue: { open: "09:00", close: "17:00", closed: false },
  wed: { open: "09:00", close: "17:00", closed: false },
  thu: { open: "09:00", close: "17:00", closed: false },
  fri: { open: "09:00", close: "17:00", closed: false },
  sat: { open: "", close: "", closed: true },
  sun: { open: "", close: "", closed: true },
};

const TZ = "America/New_York"; // EDT = UTC-4 in July
const NOW = new Date("2026-07-13T10:00:00Z"); // Mon 06:00 ET

function starts(data: Record<string, { start: string }[]>): string[] {
  return Object.values(data).flatMap((s) => s.map((x) => x.start));
}

describe("generateOpenSlots — defaults (60 min, capacity 1, 30-min step)", () => {
  it("emits half-hourly starts that fit before close, in the shop timezone", () => {
    const { data } = generateOpenSlots({ hours: HOURS, timezone: TZ, busy: [], now: NOW, days: 1 });
    const s = data["2026-07-13"].map((x) => x.start);
    // 09:00–17:00 ET, 60-min job, 30-min grid → starts 09:00…16:00 = 15.
    expect(s).toHaveLength(15);
    expect(s[0]).toBe("2026-07-13T13:00:00.000Z"); // 09:00 EDT
    expect(s.at(-1)).toBe("2026-07-13T20:00:00.000Z"); // 16:00 EDT (ends 17:00)
  });

  it("excludes closed weekend days", () => {
    const fri = new Date("2026-07-17T10:00:00Z");
    const { data } = generateOpenSlots({ hours: HOURS, timezone: TZ, busy: [], now: fri, days: 4 });
    expect(Object.keys(data).sort()).toEqual(["2026-07-17", "2026-07-20"]); // Fri + Mon
  });

  it("excludes past starts", () => {
    const now = new Date("2026-07-13T16:30:00Z"); // 12:30 ET
    const { data } = generateOpenSlots({ hours: HOURS, timezone: TZ, busy: [], now, days: 1 });
    const s = data["2026-07-13"].map((x) => x.start);
    expect(s[0]).toBe("2026-07-13T17:00:00.000Z"); // 13:00 ET
    expect(s).toHaveLength(7); // 13:00…16:00 ET
  });
});

describe("generateOpenSlots — capacity", () => {
  const booking10to11: Busy[] = [{ startUtc: new Date("2026-07-13T14:00:00Z"), endUtc: new Date("2026-07-13T15:00:00Z") }]; // 10–11 ET

  it("capacity 1: a booking blocks every 60-min start that overlaps it", () => {
    const { data } = generateOpenSlots({ hours: HOURS, timezone: TZ, busy: booking10to11, now: NOW, days: 1, capacity: 1 });
    const s = starts(data);
    // 09:30, 10:00, 10:30 ET all overlap the 10–11 booking → gone (15 − 3 = 12).
    expect(s).toHaveLength(12);
    expect(s).not.toContain("2026-07-13T14:00:00.000Z"); // 10:00 ET
    expect(s).toContain("2026-07-13T13:00:00.000Z"); // 09:00 ET still open (ends exactly at 10:00)
  });

  it("capacity 2: the same single booking leaves every slot open", () => {
    const { data } = generateOpenSlots({ hours: HOURS, timezone: TZ, busy: booking10to11, now: NOW, days: 1, capacity: 2 });
    expect(starts(data)).toHaveLength(15);
    expect(starts(data)).toContain("2026-07-13T14:00:00.000Z"); // 10:00 ET open — 1 of 2 bays free
  });

  it("capacity 2: two concurrent bookings fill the bays and block the overlap", () => {
    const two: Busy[] = [...booking10to11, { startUtc: new Date("2026-07-13T14:00:00Z"), endUtc: new Date("2026-07-13T15:00:00Z") }];
    const { data } = generateOpenSlots({ hours: HOURS, timezone: TZ, busy: two, now: NOW, days: 1, capacity: 2 });
    expect(starts(data)).not.toContain("2026-07-13T14:00:00.000Z"); // 10:00 ET now full
  });
});

describe("generateOpenSlots — duration & buffer", () => {
  it("a long service only surfaces starts where the whole job fits before close", () => {
    const { data } = generateOpenSlots({ hours: HOURS, timezone: TZ, busy: [], now: NOW, days: 1, durationMin: 180 });
    const s = data["2026-07-13"].map((x) => x.start);
    // 3-hr job, 30-min grid, must end by 17:00 → starts 09:00…14:00 ET = 11.
    expect(s).toHaveLength(11);
    expect(s.at(-1)).toBe("2026-07-13T18:00:00.000Z"); // 14:00 ET (ends 17:00)
  });

  it("buffer/travel time widens what a nearby booking blocks", () => {
    const booking: Busy[] = [{ startUtc: new Date("2026-07-13T14:00:00Z"), endUtc: new Date("2026-07-13T15:00:00Z") }]; // 10–11 ET
    const noBuffer = starts(generateOpenSlots({ hours: HOURS, timezone: TZ, busy: booking, now: NOW, days: 1 }).data);
    const withBuffer = starts(generateOpenSlots({ hours: HOURS, timezone: TZ, busy: booking, now: NOW, days: 1, bufferMin: 30 }).data);
    expect(noBuffer).toContain("2026-07-13T13:00:00.000Z"); // 09:00 ET fine without buffer
    expect(withBuffer).not.toContain("2026-07-13T13:00:00.000Z"); // 30-min buffer pushes it out
  });
});

describe("isSlotAvailable", () => {
  it("accepts an open, future, unbooked slot", () => {
    const startUtc = new Date("2026-07-13T14:00:00Z"); // 10:00 ET
    expect(isSlotAvailable({ hours: HOURS, timezone: TZ, busy: [], startUtc, now: NOW })).toBe(true);
  });

  it("rejects before open, past close, closed day, and past times", () => {
    expect(isSlotAvailable({ hours: HOURS, timezone: TZ, busy: [], startUtc: new Date("2026-07-13T12:00:00Z"), now: NOW })).toBe(false); // 08:00 ET
    expect(isSlotAvailable({ hours: HOURS, timezone: TZ, busy: [], startUtc: new Date("2026-07-13T20:30:00Z"), now: NOW })).toBe(false); // 16:30 ET ends 17:30
    expect(isSlotAvailable({ hours: HOURS, timezone: TZ, busy: [], startUtc: new Date("2026-07-18T14:00:00Z"), now: new Date("2026-07-17T10:00:00Z") })).toBe(false); // Sat
    expect(isSlotAvailable({ hours: HOURS, timezone: TZ, busy: [], startUtc: new Date("2026-07-13T09:00:00Z"), now: NOW })).toBe(false); // past
  });

  it("respects capacity when a booking overlaps", () => {
    const startUtc = new Date("2026-07-13T14:00:00Z"); // 10:00 ET
    const busy: Busy[] = [{ startUtc, endUtc: new Date("2026-07-13T15:00:00Z") }];
    expect(isSlotAvailable({ hours: HOURS, timezone: TZ, busy, startUtc, now: NOW, capacity: 1 })).toBe(false);
    expect(isSlotAvailable({ hours: HOURS, timezone: TZ, busy, startUtc, now: NOW, capacity: 2 })).toBe(true);
  });

  it("rejects a long service that would run past close", () => {
    const startUtc = new Date("2026-07-13T19:00:00Z"); // 15:00 ET + 3h = 18:00 > 17:00
    expect(isSlotAvailable({ hours: HOURS, timezone: TZ, busy: [], startUtc, now: NOW, durationMin: 180 })).toBe(false);
  });
});

describe("serviceDuration", () => {
  const cfg = {
    default_duration_min: 60,
    services: [
      { service: "Full detail", durationMin: 180, bookable: true, priceRange: "" },
      { service: "Quick wash", bookable: true, priceRange: "" },
    ],
  } as unknown as ShopConfig;

  it("uses the per-service override when set (case-insensitive)", () => {
    expect(serviceDuration(cfg, "Full detail")).toBe(180);
    expect(serviceDuration(cfg, "full detail")).toBe(180);
  });

  it("falls back to the shop default otherwise", () => {
    expect(serviceDuration(cfg, "Quick wash")).toBe(60); // no override
    expect(serviceDuration(cfg, "unknown service")).toBe(60);
    expect(serviceDuration(cfg, undefined)).toBe(60);
  });
});
