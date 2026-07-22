import "server-only";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

// Upstash Redis rate limiting. No-ops (allows) when Redis isn't configured so
// local dev without keys still works. Applied to abuse-prone / cost-bearing
// endpoints: LLM calls, verification calls, web calls, and ingest.

const url = process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN;
const redis = url && token ? new Redis({ url, token }) : null;

function make(prefix: string, limit: number, window: `${number} s` | `${number} m`) {
  return redis ? new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(limit, window), prefix: `sb:rl:${prefix}` }) : null;
}

const limiters = {
  llm: make("llm", 15, "1 m"), // config/prefill/QA generation
  verify: make("verify", 5, "1 m"), // forwarding verification calls
  webcall: make("webcall", 8, "1 m"), // browser test calls
  ingest: make("ingest", 120, "1 m"), // call ingest per shop
  broker: make("broker", 300, "1 m"), // n8n broker lookups (keyed by client IP)
  forwarding: make("forwarding", 30, "1 m"), // forwarding-verified callbacks (by IP)
  demo: make("demo", 3, "10 m"), // public landing-page real demo calls, per IP
  agentNotify: make("agentNotify", 8, "10 m"), // notify_owner SMS per shop (spam/cost guard)
  // check-availability / create-booking per shop. Raised from 20 because this
  // limit is shared across a shop's SIMULTANEOUS calls, and one call makes
  // several tool calls: five callers at once × ~4 tools each sat exactly on the
  // old ceiling. Exceeding it is not a silent 429 — the agent speaks "One
  // moment, please try again shortly" to a live caller, so a busy shop would
  // have throttled itself precisely when it could least afford to. Note ingest
  // above already allows 120/min for the same reason. Still bounded, so a
  // runaway agent loop or a leaked token can't run up an unlimited bill.
  agentTool: make("agentTool", 120, "1 m"),
  demoLogin: make("demoLogin", 10, "10 m"), // reviewer demo-code attempts (brute-force guard)
  mobileAuth: make("mobileAuth", 8, "10 m"), // owner-app OTP request/verify, per IP
  mobileApi: make("mobileApi", 120, "1 m"), // owner-app data calls, per device
};

/**
 * Returns true if allowed, false if rate-limited. By default FAILS OPEN if the
 * limiter is unconfigured or Redis errors (so a limiter outage never blocks
 * legitimate traffic). Pass { failClosed: true } for cost-bearing PUBLIC
 * endpoints (e.g. the demo web-call), where "deny on outage" is safer than
 * "unlimited spend on outage".
 */
export async function rateLimit(kind: keyof typeof limiters, id: string, opts?: { failClosed?: boolean }): Promise<boolean> {
  const limiter = limiters[kind];
  if (!limiter) return !opts?.failClosed;
  try {
    const { success } = await limiter.limit(id);
    return success;
  } catch {
    return !opts?.failClosed;
  }
}
