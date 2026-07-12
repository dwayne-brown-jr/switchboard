import { describe, it, expect } from "vitest";
import { secretEquals } from "./secure";

describe("secretEquals", () => {
  it("returns true for identical secrets", () => {
    expect(secretEquals("s3cr3t-token", "s3cr3t-token")).toBe(true);
  });

  it("returns false for different secrets", () => {
    expect(secretEquals("s3cr3t-token", "s3cr3t-tokeX")).toBe(false);
  });

  it("returns false for length-mismatched secrets (no throw)", () => {
    expect(secretEquals("short", "a-much-longer-secret-value")).toBe(false);
  });

  it("returns false when either side is empty/null/undefined", () => {
    expect(secretEquals("", "x")).toBe(false);
    expect(secretEquals("x", "")).toBe(false);
    expect(secretEquals(null, "x")).toBe(false);
    expect(secretEquals("x", undefined)).toBe(false);
    expect(secretEquals(null, null)).toBe(false);
  });

  it("matches a full bearer header string", () => {
    expect(secretEquals("Bearer abc123", "Bearer abc123")).toBe(true);
    expect(secretEquals("Bearer abc123", "Bearer abc124")).toBe(false);
  });
});
