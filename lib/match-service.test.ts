import { describe, it, expect } from "vitest";
import { fuzzyMatchKey } from "./match-service";

const KEYS = ["Oil change", "Brake service", "Check-engine / diagnostics", "A/C service", "Tire rotation", "State inspection"];

describe("fuzzyMatchKey", () => {
  it("exact and case-insensitive", () => {
    expect(fuzzyMatchKey(KEYS, "Oil change")).toBe("Oil change");
    expect(fuzzyMatchKey(KEYS, "brake service")).toBe("Brake service");
  });

  it("matches verbose caller phrasing (the real test-call case)", () => {
    expect(fuzzyMatchKey(KEYS, "Routine maintenance and oil change for 2018 BMW X5")).toBe("Oil change");
    expect(fuzzyMatchKey(KEYS, "brakes")).toBe("Brake service");
    expect(fuzzyMatchKey(KEYS, "check engine light")).toBe("Check-engine / diagnostics");
  });

  it("returns undefined on ambiguity, no match, or empty", () => {
    expect(fuzzyMatchKey(KEYS, "service")).toBeUndefined(); // Brake service & A/C service tie
    expect(fuzzyMatchKey(KEYS, "window tint")).toBeUndefined();
    expect(fuzzyMatchKey(KEYS, "")).toBeUndefined();
    expect(fuzzyMatchKey(KEYS, null)).toBeUndefined();
  });
});
