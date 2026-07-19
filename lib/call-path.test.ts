import { describe, expect, it } from "vitest";
import { classifyCallPath } from "./call-path";

// SILENT_DAYS defaults to 4 (lib/call-path.ts), so "old" here means >4 days back.
const NOW = new Date("2026-07-19T12:00:00Z").getTime();
const daysAgo = (n: number) => new Date(NOW - n * 86_400_000);

const ready = (id: string) => ({ id, agentNumber: "+17605550100", liveVersionId: "v1" });

describe("classifyCallPath", () => {
  it("is ok with no live shops", () => {
    expect(classifyCallPath([], new Map(), NOW)).toEqual({ status: "ok", silent: 0, misconfigured: 0 });
  });

  it("is ok when a live shop called recently", () => {
    const res = classifyCallPath([ready("a")], new Map([["a", daysAgo(1)]]), NOW);
    expect(res).toEqual({ status: "ok", silent: 0, misconfigured: 0 });
  });

  it("flags a shop that had history and went quiet past the window", () => {
    const res = classifyCallPath([ready("a")], new Map([["a", daysAgo(9)]]), NOW);
    expect(res).toEqual({ status: "degraded", silent: 1, misconfigured: 0 });
  });

  it("skips shops with no call history — brand new and broken look identical", () => {
    const res = classifyCallPath([ready("a")], new Map(), NOW);
    expect(res).toEqual({ status: "ok", silent: 0, misconfigured: 0 });
  });

  it("flags a live shop with no phone number", () => {
    const res = classifyCallPath([{ id: "a", agentNumber: null, liveVersionId: "v1" }], new Map(), NOW);
    expect(res).toEqual({ status: "degraded", silent: 0, misconfigured: 1 });
  });

  it("flags a live shop with no live agent version", () => {
    const res = classifyCallPath([{ id: "a", agentNumber: "+17605550100", liveVersionId: null }], new Map(), NOW);
    expect(res).toEqual({ status: "degraded", silent: 0, misconfigured: 1 });
  });

  it("counts a misconfigured shop once, not also as silent", () => {
    const res = classifyCallPath(
      [{ id: "a", agentNumber: null, liveVersionId: null }],
      new Map([["a", daysAgo(30)]]),
      NOW,
    );
    expect(res).toEqual({ status: "degraded", silent: 0, misconfigured: 1 });
  });

  it("counts each failing shop separately", () => {
    const res = classifyCallPath(
      [ready("a"), ready("b"), { id: "c", agentNumber: null, liveVersionId: "v1" }],
      new Map([
        ["a", daysAgo(9)],
        ["b", daysAgo(9)],
      ]),
      NOW,
    );
    expect(res).toEqual({ status: "degraded", silent: 2, misconfigured: 1 });
  });

  it("treats the boundary just inside the window as healthy", () => {
    const res = classifyCallPath([ready("a")], new Map([["a", daysAgo(3.9)]]), NOW);
    expect(res.status).toBe("ok");
  });
});
