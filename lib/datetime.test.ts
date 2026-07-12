import { describe, it, expect } from "vitest";
import { hasOffset, naiveLocalToUtc } from "./datetime";

describe("hasOffset", () => {
  it("detects Z and ±hh:mm", () => {
    expect(hasOffset("2026-07-15T14:00:00Z")).toBe(true);
    expect(hasOffset("2026-07-15T14:00:00-05:00")).toBe(true);
    expect(hasOffset("2026-07-15T14:00:00+0200")).toBe(true);
    expect(hasOffset("2026-07-15T14:00:00")).toBe(false);
  });
});

describe("naiveLocalToUtc", () => {
  it("interprets a naive time in the shop's zone (DST-aware)", () => {
    // 2 PM in Chicago in July (CDT, UTC-5) → 19:00 UTC.
    expect(naiveLocalToUtc("2026-07-15T14:00:00", "America/Chicago")).toBe("2026-07-15T19:00:00.000Z");
    // 9 AM Los Angeles in July (PDT, UTC-7) → 16:00 UTC.
    expect(naiveLocalToUtc("2026-07-15T09:00:00", "America/Los_Angeles")).toBe("2026-07-15T16:00:00.000Z");
    // Winter respects DST offset change (EST, UTC-5).
    expect(naiveLocalToUtc("2026-01-15T09:00:00", "America/New_York")).toBe("2026-01-15T14:00:00.000Z");
  });

  it("leaves offset-carrying or invalid input untouched", () => {
    expect(naiveLocalToUtc("2026-07-15T14:00:00Z", "America/Chicago")).toBe("2026-07-15T14:00:00Z");
    expect(naiveLocalToUtc("2026-07-15T14:00:00-04:00", "America/Chicago")).toBe("2026-07-15T14:00:00-04:00");
    expect(naiveLocalToUtc("2026-07-15T14:00:00", null)).toBe("2026-07-15T14:00:00");
    expect(naiveLocalToUtc("not-a-date", "America/Chicago")).toBe("not-a-date");
  });
});
