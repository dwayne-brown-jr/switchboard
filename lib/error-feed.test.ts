import { afterEach, describe, expect, it } from "vitest";
import { classifyErrorFeed, errorAlertThreshold, ERROR_WINDOW_MINUTES } from "./error-feed";

const ORIGINAL = process.env.ERROR_ALERT_THRESHOLD;
afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.ERROR_ALERT_THRESHOLD;
  else process.env.ERROR_ALERT_THRESHOLD = ORIGINAL;
});

describe("errorAlertThreshold", () => {
  it("defaults to 3 when unset", () => {
    delete process.env.ERROR_ALERT_THRESHOLD;
    expect(errorAlertThreshold()).toBe(3);
  });

  it("falls back to the default rather than alerting on everything when given junk", () => {
    for (const bad of ["", "abc", "-1", "0", "NaN"]) {
      process.env.ERROR_ALERT_THRESHOLD = bad;
      expect(errorAlertThreshold()).toBe(3);
    }
  });

  it("honours a valid override", () => {
    process.env.ERROR_ALERT_THRESHOLD = "10";
    expect(errorAlertThreshold()).toBe(10);
  });

  it("floors a fractional value", () => {
    process.env.ERROR_ALERT_THRESHOLD = "4.9";
    expect(errorAlertThreshold()).toBe(4);
  });
});

describe("classifyErrorFeed", () => {
  it("is ok on a quiet feed", () => {
    expect(classifyErrorFeed({ errors: 0, warns: 0 }, 3)).toMatchObject({ status: "ok", errors: 0 });
  });

  it("is ok below the threshold", () => {
    expect(classifyErrorFeed({ errors: 2, warns: 0 }, 3).status).toBe("ok");
  });

  it("degrades at the threshold", () => {
    expect(classifyErrorFeed({ errors: 3, warns: 0 }, 3).status).toBe("degraded");
  });

  it("degrades above the threshold", () => {
    expect(classifyErrorFeed({ errors: 99, warns: 0 }, 3).status).toBe("degraded");
  });

  it("never alerts on warns alone — they have their own alerting", () => {
    const res = classifyErrorFeed({ errors: 0, warns: 500 }, 3);
    expect(res.status).toBe("ok");
    expect(res.warns).toBe(500);
  });

  it("reports the window and threshold so an alert is self-explanatory", () => {
    const res = classifyErrorFeed({ errors: 1, warns: 1 }, 7, 120);
    expect(res).toEqual({ status: "ok", errors: 1, warns: 1, windowMinutes: 120, threshold: 7 });
  });

  it("defaults the window to the shared constant", () => {
    expect(classifyErrorFeed({ errors: 0, warns: 0 }, 3).windowMinutes).toBe(ERROR_WINDOW_MINUTES);
  });
});
