import { afterEach, describe, expect, it } from "vitest";
import { capacityWarnPct, classifyCapacity } from "./capacity";

const ORIGINAL = process.env.CAPACITY_WARN_PCT;
afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.CAPACITY_WARN_PCT;
  else process.env.CAPACITY_WARN_PCT = ORIGINAL;
});

describe("capacityWarnPct", () => {
  it("defaults to 70 when unset", () => {
    delete process.env.CAPACITY_WARN_PCT;
    expect(capacityWarnPct()).toBe(70);
  });

  it("rejects junk and out-of-range values rather than alerting on everything", () => {
    for (const bad of ["", "abc", "0", "-5", "101", "NaN"]) {
      process.env.CAPACITY_WARN_PCT = bad;
      expect(capacityWarnPct()).toBe(70);
    }
  });

  it("honours a valid override", () => {
    process.env.CAPACITY_WARN_PCT = "85";
    expect(capacityWarnPct()).toBe(85);
  });
});

describe("classifyCapacity", () => {
  it("is ok with plenty of headroom", () => {
    expect(classifyCapacity({ used: 2, limit: 20 }, 70)).toMatchObject({
      status: "ok",
      utilizationPct: 10,
    });
  });

  it("is ok on an idle account", () => {
    expect(classifyCapacity({ used: 0, limit: 20 }, 70).status).toBe("ok");
  });

  it("degrades at the threshold", () => {
    expect(classifyCapacity({ used: 14, limit: 20 }, 70)).toMatchObject({
      status: "degraded",
      utilizationPct: 70,
    });
  });

  it("degrades when saturated", () => {
    expect(classifyCapacity({ used: 20, limit: 20 }, 70)).toMatchObject({
      status: "degraded",
      utilizationPct: 100,
    });
  });

  // A vendor outage is not something we can fix, so it must not page us.
  it("reports unknown — not degraded — when the reading is unavailable", () => {
    expect(classifyCapacity(null, 70).status).toBe("unknown");
  });

  it("reports unknown rather than dividing by zero on a nonsense limit", () => {
    expect(classifyCapacity({ used: 5, limit: 0 }, 70).status).toBe("unknown");
    expect(classifyCapacity({ used: 5, limit: -1 }, 70).status).toBe("unknown");
  });

  it("clamps a negative used count", () => {
    expect(classifyCapacity({ used: -3, limit: 20 }, 70).used).toBe(0);
  });

  it("echoes the threshold so an alert explains itself", () => {
    expect(classifyCapacity({ used: 1, limit: 20 }, 85).warnPct).toBe(85);
  });
});
