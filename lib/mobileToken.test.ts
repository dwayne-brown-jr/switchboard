import { describe, it, expect } from "vitest";
import { issueDeviceToken, verifyDeviceToken } from "./mobileToken";

describe("device token", () => {
  it("round-trips a device id", () => {
    const token = issueDeviceToken("dev_abc123");
    expect(verifyDeviceToken(token)).toBe("dev_abc123");
  });

  it("rejects a tampered signature", () => {
    const token = issueDeviceToken("dev_abc123");
    const bad = token.slice(0, -1) + (token.at(-1) === "0" ? "1" : "0");
    expect(verifyDeviceToken(bad)).toBeNull();
  });

  it("rejects a swapped device id (sig no longer matches)", () => {
    const token = issueDeviceToken("dev_abc123");
    const sig = token.slice(token.lastIndexOf(".") + 1);
    expect(verifyDeviceToken(`dev_evil.${sig}`)).toBeNull();
  });

  it("rejects malformed tokens", () => {
    expect(verifyDeviceToken("")).toBeNull();
    expect(verifyDeviceToken("nodot")).toBeNull();
    expect(verifyDeviceToken(".sigonly")).toBeNull();
  });
});
