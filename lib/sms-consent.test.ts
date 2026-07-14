import { describe, expect, it } from "vitest";
import { parseSmsKeyword, messagingTwiml, helpReplyText } from "./sms-consent";

describe("parseSmsKeyword", () => {
  it("recognizes the standard STOP keywords", () => {
    for (const w of ["STOP", "stop", "StopAll", "UNSUBSCRIBE", "cancel", "END", "quit"]) {
      expect(parseSmsKeyword(w), w).toBe("stop");
    }
  });

  it("recognizes START and HELP keywords", () => {
    for (const w of ["START", "unstop", "yes"]) expect(parseSmsKeyword(w), w).toBe("start");
    for (const w of ["HELP", "info"]) expect(parseSmsKeyword(w), w).toBe("help");
  });

  it("ignores case, whitespace, and surrounding punctuation", () => {
    expect(parseSmsKeyword("  Stop.  ")).toBe("stop");
    expect(parseSmsKeyword('"HELP"')).toBe("help");
    expect(parseSmsKeyword("stop!!!")).toBe("stop");
  });

  it("does NOT treat keywords embedded in sentences as keywords", () => {
    expect(parseSmsKeyword("please stop calling me")).toBeNull();
    expect(parseSmsKeyword("can you help me reschedule")).toBeNull();
    expect(parseSmsKeyword("stop the appointment")).toBeNull();
  });

  it("returns null for normal messages and empty input", () => {
    expect(parseSmsKeyword("See you at 3pm")).toBeNull();
    expect(parseSmsKeyword("")).toBeNull();
    expect(parseSmsKeyword(null)).toBeNull();
    expect(parseSmsKeyword(undefined)).toBeNull();
  });
});

describe("messagingTwiml", () => {
  it("returns an empty <Response/> with no message", () => {
    expect(messagingTwiml()).toBe('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
  });

  it("wraps and XML-escapes the reply", () => {
    const out = messagingTwiml("Bob's Shop <alerts> & more");
    expect(out).toContain("<Message>Bob's Shop &lt;alerts&gt; &amp; more</Message>");
  });
});

describe("helpReplyText", () => {
  it("identifies the program and includes STOP instructions", () => {
    const text = helpReplyText("Riverside Auto");
    expect(text).toContain("Riverside Auto");
    expect(text).toContain("STOP");
    expect(text).toContain("Msg & data rates");
  });
});
