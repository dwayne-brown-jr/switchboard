import { describe, it, expect } from "vitest";
import { parseDsn } from "./sentry-dsn";

describe("parseDsn", () => {
  it("parses a standard SaaS DSN", () => {
    const p = parseDsn("https://abc123@o12345.ingest.sentry.io/6789");
    expect(p).not.toBeNull();
    expect(p!.publicKey).toBe("abc123");
    expect(p!.url).toBe(
      "https://o12345.ingest.sentry.io/api/6789/envelope/?sentry_key=abc123&sentry_version=7",
    );
  });

  it("parses a self-hosted DSN with a path prefix", () => {
    const p = parseDsn("https://key@sentry.example.com/prefix/42");
    expect(p!.url).toBe(
      "https://sentry.example.com/prefix/api/42/envelope/?sentry_key=key&sentry_version=7",
    );
  });

  it("tolerates surrounding whitespace", () => {
    expect(parseDsn("  https://k@host/9  ")!.url).toContain("/api/9/envelope/");
  });

  it("returns null for malformed DSNs", () => {
    expect(parseDsn("")).toBeNull();
    expect(parseDsn("not-a-url")).toBeNull();
    expect(parseDsn("https://host/9")).toBeNull(); // no public key
    expect(parseDsn("https://key@host")).toBeNull(); // no project id
  });
});
