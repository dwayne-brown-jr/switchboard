import { describe, it, expect } from "vitest";
import { estJobValueToCents, nextStage, DORMANT_DAYS } from "./customer";
import { toE164 } from "./phone";
import { toE164 as backfillToE164, splitName as backfillSplitName, estJobValueToCents as backfillCents } from "../scripts/backfill-customers.mjs";

// Pure-logic tests for the customer layer, matching the suite's existing style
// (no DB). The DB-backed guarantees — write-order convergence, concurrency,
// tenant isolation — live in customer-db.test.ts.

describe("estJobValueToCents", () => {
  // CallRecord.estJobValue is whole DOLLARS (pre-existing, from the voice
  // provider's analysis); everything the customer layer adds is CENTS. This
  // function is the single crossing point, so it carries the whole risk of the
  // two units getting mixed.
  it("converts dollars to cents", () => {
    expect(estJobValueToCents(450)).toBe(45_000);
    expect(estJobValueToCents(1)).toBe(100);
  });

  it("treats absent/zero/negative value as zero rather than NaN", () => {
    expect(estJobValueToCents(0)).toBe(0);
    expect(estJobValueToCents(null)).toBe(0);
    expect(estJobValueToCents(undefined)).toBe(0);
    expect(estJobValueToCents(-50)).toBe(0);
    expect(estJobValueToCents(Number.NaN)).toBe(0);
    expect(estJobValueToCents(Number.POSITIVE_INFINITY)).toBe(0);
  });

  it("never produces a fractional cent", () => {
    // Defensive: estJobValue is typed as an int, but it arrives from an
    // external analysis payload and a float would silently poison every sum.
    expect(Number.isInteger(estJobValueToCents(49.99))).toBe(true);
    expect(estJobValueToCents(49.99)).toBe(4_999);
  });
});

describe("nextStage", () => {
  const now = new Date("2026-08-10T12:00:00Z");
  const daysAgo = (n: number) => new Date(now.getTime() - n * 86_400_000);

  it("is a lead until they book", () => {
    expect(nextStage("lead", 0, daysAgo(3), now)).toBe("lead");
  });

  it("becomes active on the first booking", () => {
    expect(nextStage("lead", 1, daysAgo(3), now)).toBe("active");
  });

  it("goes dormant after the threshold, even with bookings", () => {
    expect(nextStage("active", 5, daysAgo(DORMANT_DAYS + 1), now)).toBe("dormant");
  });

  it("stays active right up to the threshold", () => {
    expect(nextStage("active", 5, daysAgo(DORMANT_DAYS - 1), now)).toBe("active");
  });

  it("revives a dormant customer when they make contact again", () => {
    expect(nextStage("dormant", 2, daysAgo(1), now)).toBe("active");
  });

  it("never un-marks a customer the owner marked lost", () => {
    // One-way by design: an owner writing someone off shouldn't have the
    // nightly reconciliation job silently overrule them.
    expect(nextStage("lost", 9, daysAgo(1), now)).toBe("lost");
    expect(nextStage("lost", 0, daysAgo(999), now)).toBe("lost");
  });
});

describe("backfill script stays in sync with lib", () => {
  // scripts/backfill-customers.mjs deliberately carries its own copies of these
  // helpers (it's plain .mjs and can't import the server-only TS chain). That
  // duplication is only safe while the copies agree — this is what makes the
  // drift loud instead of silent.
  const cases = [
    "5551234567",
    "+15551234567",
    "15551234567",
    "(555) 123-4567",
    "555-123-4567",
    "+4106934140", // US number missing its country code
    "+442071838750",
    "",
    "anonymous",
    "unknown",
    "+1555",
    "sip:caller@example.com",
    "555123456789012345",
  ];

  it("toE164 agrees on every case", () => {
    for (const c of cases) {
      expect(backfillToE164(c), `disagreed on ${JSON.stringify(c)}`).toBe(toE164(c));
    }
  });

  it("toE164 agrees on null/undefined", () => {
    expect(backfillToE164(null)).toBe(toE164(null));
    expect(backfillToE164(undefined)).toBe(toE164(undefined));
  });

  it("estJobValueToCents agrees", () => {
    for (const v of [0, 1, 450, 49.99, -5, null, undefined]) {
      expect(backfillCents(v)).toBe(estJobValueToCents(v as number));
    }
  });
});

describe("blocked caller ID stays anonymous", () => {
  // The single most consequential decision in the layer: a number we can't
  // confidently normalize resolves to NOTHING rather than to a placeholder
  // customer. Collapsing every withheld-caller-ID call into one fictional
  // person would corrupt every rollup on the page, and it would look plausible
  // while doing it.
  it("refuses to normalize the values a blocked call actually arrives as", () => {
    for (const raw of ["", "anonymous", "unknown", "Anonymous", "restricted", "+", "0", "blocked"]) {
      expect(toE164(raw), `${JSON.stringify(raw)} must not normalize`).toBeNull();
    }
  });
});

describe("splitName", () => {
  it("splits a full name", () => {
    expect(backfillSplitName("Dwayne Leon")).toEqual({ first: "Dwayne", last: "Leon" });
  });

  it("treats a single token as a first name and does not invent a surname", () => {
    expect(backfillSplitName("Dwayne")).toEqual({ first: "Dwayne", last: null });
  });

  it("keeps multi-part surnames intact", () => {
    expect(backfillSplitName("Ana Maria de la Cruz")).toEqual({ first: "Ana", last: "Maria de la Cruz" });
  });

  it("handles empty and whitespace input", () => {
    expect(backfillSplitName("")).toEqual({ first: null, last: null });
    expect(backfillSplitName("   ")).toEqual({ first: null, last: null });
    expect(backfillSplitName(null)).toEqual({ first: null, last: null });
  });
});
