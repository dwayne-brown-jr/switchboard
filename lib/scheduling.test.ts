import { describe, it, expect } from "vitest";
import { generateOpenSlots, isSlotAvailable, type Busy } from "./scheduling";
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

const TZ = "America/New_York";

function flat(data: Record<string, { start: string }[]>): string[] {
  return Object.values(data).flatMap((s) => s.map((x) => x.start));
}

describe("generateOpenSlots", () => {
  it("emits hourly slots inside open hours, in the shop timezone", () => {
    // Mon 2026-07-13 06:00 ET (10:00Z, EDT = UTC-4).
    const now = new Date("2026-07-13T10:00:00Z");
    const { data } = generateOpenSlots({ hours: HOURS, timezone: TZ, busy: [], now, days: 1 });
    const starts = data["2026-07-13"].map((s) => s.start);
    // 09:00–17:00 ET → 8 one-hour slots (09,10,…,16), first at 13:00Z (09:00 EDT).
    expect(starts).toHaveLength(8);
    expect(starts[0]).toBe("2026-07-13T13:00:00.000Z");
    expect(starts.at(-1)).toBe("2026-07-13T20:00:00.000Z"); // 16:00 EDT
  });

  it("excludes closed days (weekend)", () => {
    // Fri → look ahead across the weekend; Sat/Sun produce nothing.
    const now = new Date("2026-07-17T10:00:00Z"); // Fri 06:00 ET
    const { data } = generateOpenSlots({ hours: HOURS, timezone: TZ, busy: [], now, days: 4 });
    expect(Object.keys(data).sort()).toEqual(["2026-07-17", "2026-07-20"]); // Fri + Mon only
  });

  it("excludes past slots (later same day)", () => {
    // Mon 12:30 ET (16:30Z) — 09,10,11,12 already gone.
    const now = new Date("2026-07-13T16:30:00Z");
    const { data } = generateOpenSlots({ hours: HOURS, timezone: TZ, busy: [], now, days: 1 });
    const starts = data["2026-07-13"].map((s) => s.start);
    expect(starts[0]).toBe("2026-07-13T17:00:00.000Z"); // 13:00 EDT
    expect(starts).toHaveLength(4); // 13,14,15,16 ET
  });

  it("subtracts this shop's busy intervals", () => {
    const now = new Date("2026-07-13T10:00:00Z");
    const busy: Busy[] = [{ startUtc: new Date("2026-07-13T14:00:00Z"), endUtc: new Date("2026-07-13T15:00:00Z") }]; // 10:00 ET
    const { data } = generateOpenSlots({ hours: HOURS, timezone: TZ, busy, now, days: 1 });
    const starts = data["2026-07-13"].map((s) => s.start);
    expect(starts).not.toContain("2026-07-13T14:00:00.000Z");
    expect(starts).toHaveLength(7); // 8 minus the booked one
  });
});

describe("isSlotAvailable", () => {
  const now = new Date("2026-07-13T10:00:00Z"); // Mon 06:00 ET

  it("accepts an open, future, unbooked slot", () => {
    const startUtc = new Date("2026-07-13T14:00:00Z"); // Mon 10:00 ET
    expect(isSlotAvailable({ hours: HOURS, timezone: TZ, busy: [], startUtc, now })).toBe(true);
  });

  it("rejects a time outside business hours", () => {
    const startUtc = new Date("2026-07-13T12:00:00Z"); // Mon 08:00 ET (before open)
    expect(isSlotAvailable({ hours: HOURS, timezone: TZ, busy: [], startUtc, now })).toBe(false);
  });

  it("rejects a slot that would run past closing", () => {
    const startUtc = new Date("2026-07-13T20:30:00Z"); // Mon 16:30 ET → ends 17:30, past 17:00
    expect(isSlotAvailable({ hours: HOURS, timezone: TZ, busy: [], startUtc, now })).toBe(false);
  });

  it("rejects a closed day", () => {
    const startUtc = new Date("2026-07-18T14:00:00Z"); // Sat
    expect(isSlotAvailable({ hours: HOURS, timezone: TZ, busy: [], startUtc, now: new Date("2026-07-17T10:00:00Z") })).toBe(false);
  });

  it("rejects a past time", () => {
    const startUtc = new Date("2026-07-13T09:00:00Z"); // before now
    expect(isSlotAvailable({ hours: HOURS, timezone: TZ, busy: [], startUtc, now })).toBe(false);
  });

  it("rejects an already-booked slot", () => {
    const startUtc = new Date("2026-07-13T14:00:00Z");
    const busy: Busy[] = [{ startUtc: new Date("2026-07-13T14:00:00Z"), endUtc: new Date("2026-07-13T15:00:00Z") }];
    expect(isSlotAvailable({ hours: HOURS, timezone: TZ, busy, startUtc, now })).toBe(false);
  });
});
