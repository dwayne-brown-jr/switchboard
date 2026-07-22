import { describe, expect, it } from "vitest";
import { APPROACHING_PCT, usageMeter } from "./usage-meter";

describe("usageMeter", () => {
  it("is calm well inside the allowance", () => {
    expect(usageMeter(120, 500)).toMatchObject({ pct: 24, tone: "ok", remaining: 380 });
  });

  it("is calm on a brand-new shop with no calls yet", () => {
    expect(usageMeter(0, 500)).toMatchObject({ pct: 0, tone: "ok", remaining: 500 });
  });

  // The threshold is applied to the ROUNDED percentage, so the tone always
  // agrees with the figure on screen. 399/500 is 79.8%, which displays as 80%
  // and therefore warns — showing "80%" while calling it fine is the real bug.
  it("warns from the approaching threshold, matching the displayed percentage", () => {
    expect(usageMeter(397, 500)).toMatchObject({ rawPct: 79, tone: "ok" });
    expect(usageMeter(399, 500)).toMatchObject({ rawPct: 80, tone: "approaching" });
    expect(usageMeter(400, 500)).toMatchObject({ rawPct: 80, tone: "approaching" });
  });

  // Must match usageStatus().over in lib/usage.ts, which uses `used > included`.
  // If these ever disagree, the meter tells an owner something different from
  // the code that changes their bill.
  it("treats exactly the included minutes as not over", () => {
    expect(usageMeter(500, 500).tone).toBe("approaching");
    expect(usageMeter(501, 500).tone).toBe("over");
  });

  it("clamps the bar at 100% but keeps the true figure for copy", () => {
    const m = usageMeter(560, 500);
    expect(m.pct).toBe(100);
    expect(m.rawPct).toBe(112);
    expect(m.remaining).toBe(0);
  });

  it("never reports negative remaining", () => {
    expect(usageMeter(9999, 500).remaining).toBe(0);
  });

  it("clamps a negative or junk used value", () => {
    expect(usageMeter(-40, 500)).toMatchObject({ used: 0, pct: 0, tone: "ok" });
    expect(usageMeter(NaN, 500).used).toBe(0);
  });

  it("reports ok rather than dividing by a missing allowance", () => {
    for (const bad of [0, -1, NaN, Infinity]) {
      expect(usageMeter(300, bad)).toMatchObject({ tone: "ok", pct: 0, included: 0 });
    }
  });

  it("rounds fractional minutes", () => {
    expect(usageMeter(249.6, 500).used).toBe(250);
  });

  it("exposes the threshold so the UI and tests agree on one number", () => {
    expect(APPROACHING_PCT).toBe(80);
  });
});
