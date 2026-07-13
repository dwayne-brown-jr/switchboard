import { describe, it, expect } from "vitest";
import { toE164 } from "./phone";

describe("toE164", () => {
  it("normalizes common US formats", () => {
    expect(toE164("410-693-4140")).toBe("+14106934140");
    expect(toE164("(410) 693-4140")).toBe("+14106934140");
    expect(toE164("4106934140")).toBe("+14106934140");
    expect(toE164("1 410 693 4140")).toBe("+14106934140");
    expect(toE164("+14106934140")).toBe("+14106934140");
  });

  it("repairs a US number that's missing its country code", () => {
    // The live bug: stored "+4106934140" (no leading 1) → Twilio failed.
    expect(toE164("+4106934140")).toBe("+14106934140");
  });

  it("preserves a valid non-US E.164", () => {
    expect(toE164("+447911123456")).toBe("+447911123456");
  });

  it("returns null when it can't be confident", () => {
    expect(toE164("")).toBeNull();
    expect(toE164(null)).toBeNull();
    expect(toE164("555-0142")).toBeNull(); // too short
    expect(toE164("not a phone")).toBeNull();
  });
});
