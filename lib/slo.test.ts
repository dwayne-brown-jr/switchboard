import { describe, expect, it } from "vitest";
import { AVAILABILITY_SLO_MS, classifySlo } from "./slo";

describe("classifySlo", () => {
  it("is ok comfortably inside the objective", () => {
    expect(classifySlo(300)).toEqual({ status: "ok", ms: 300, sloMs: AVAILABILITY_SLO_MS });
  });

  it("is ok exactly at the objective — the SLO is a ceiling, not a cliff", () => {
    expect(classifySlo(AVAILABILITY_SLO_MS).status).toBe("ok");
  });

  it("is slow one millisecond over", () => {
    expect(classifySlo(AVAILABILITY_SLO_MS + 1).status).toBe("slow");
  });

  it("rounds fractional milliseconds", () => {
    expect(classifySlo(278.6).ms).toBe(279);
  });

  it("clamps a negative reading", () => {
    expect(classifySlo(-5)).toEqual({ status: "ok", ms: 0, sloMs: AVAILABILITY_SLO_MS });
  });

  it("honours a custom objective", () => {
    expect(classifySlo(900, 800).status).toBe("slow");
    expect(classifySlo(700, 800).status).toBe("ok");
  });

  it("echoes the objective so an alert explains itself", () => {
    expect(classifySlo(100, 800).sloMs).toBe(800);
  });
});
