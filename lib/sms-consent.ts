// SMS STOP/HELP compliance keywords (CTIA / A2P 10DLC). Pure — no IO — so the
// inbound-webhook route stays thin and this logic is unit-testable.
//
// Twilio's built-in opt-out handling already blocks the (From → To) pair at the
// carrier level and auto-replies to STOP/START on US long codes; our job is to
// PERSIST the opt-out (so we stop attempting sends and avoid error 21610) and
// to answer HELP with program identification, which A2P campaigns require.

export type SmsKeyword = "stop" | "start" | "help";

const STOP_WORDS = new Set(["stop", "stopall", "unsubscribe", "cancel", "end", "quit"]);
const START_WORDS = new Set(["start", "unstop", "yes"]);
const HELP_WORDS = new Set(["help", "info"]);

/** Classify an inbound SMS body as a compliance keyword, or null for a normal
 *  message. Carriers only treat single-word replies as keywords, so we match
 *  the WHOLE message (case-insensitive, surrounding punctuation ignored) —
 *  "please stop calling me" is a message, "STOP" / "Stop." is a keyword. */
export function parseSmsKeyword(body: string | null | undefined): SmsKeyword | null {
  const word = (body ?? "").trim().toLowerCase().replace(/^[^a-z]+|[^a-z]+$/g, "");
  if (STOP_WORDS.has(word)) return "stop";
  if (START_WORDS.has(word)) return "start";
  if (HELP_WORDS.has(word)) return "help";
  return null;
}

/** The HELP auto-reply — must identify the program per A2P requirements. */
export function helpReplyText(businessName: string): string {
  return `${businessName} alerts (via Switchboard): booking + urgent-call texts for your business. Reply STOP to unsubscribe, START to resubscribe. Msg & data rates may apply.`;
}

/** Append the standard opt-out line to an outbound owner alert.
 *
 *  A2P campaigns are registered with sample messages, and carriers expect the
 *  traffic to match them — our registered samples carry "Reply STOP to opt out",
 *  so every alert must actually send it (a mismatch is a re-rejection risk, and
 *  opt-out visibility is a CTIA expectation regardless).
 *
 *  Idempotent: a body that already mentions STOP is returned unchanged, so this
 *  is safe to apply at the send site without double-appending. */
export function withOptOut(body: string): string {
  return /\bstop\b/i.test(body) ? body : `${body} Reply STOP to opt out.`;
}

/** Wrap an optional reply in Twilio Messaging TwiML. No message → empty
 *  <Response/> (acknowledge without auto-replying). */
export function messagingTwiml(message?: string): string {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return `<?xml version="1.0" encoding="UTF-8"?><Response>${message ? `<Message>${esc(message)}</Message>` : ""}</Response>`;
}
