import { describe, it, expect } from "vitest";
import { resolveEventType } from "./agentTools";

const RIVERSIDE = {
  "Oil change": "1",
  "Brake service": "2",
  "Check-engine / diagnostics": "3",
  "A/C service": "4",
  "Tire rotation": "5",
  "State inspection": "6",
};

describe("resolveEventType", () => {
  it("exact and case-insensitive match", () => {
    expect(resolveEventType(RIVERSIDE, "Brake service")).toBe("2");
    expect(resolveEventType(RIVERSIDE, "oil change")).toBe("1");
  });

  it("token match handles plurals / partial phrasing", () => {
    expect(resolveEventType(RIVERSIDE, "brakes")).toBe("2");
    expect(resolveEventType(RIVERSIDE, "tire rotations")).toBe("5");
    expect(resolveEventType(RIVERSIDE, "check engine")).toBe("3");
  });

  it("returns undefined when ambiguous (shared generic token) or unmatched", () => {
    expect(resolveEventType(RIVERSIDE, "service")).toBeUndefined(); // Brake service & A/C service tie
    expect(resolveEventType(RIVERSIDE, "detailing")).toBeUndefined();
    expect(resolveEventType(RIVERSIDE, undefined)).toBeUndefined(); // 6 entries, no auto-pick
  });

  it("auto-picks only when there is exactly one service", () => {
    expect(resolveEventType({ "Deep clean": "9" }, undefined)).toBe("9");
    expect(resolveEventType({ "Deep clean": "9" }, "anything")).toBe("9");
  });
});
