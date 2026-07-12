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
};

/** Returns true if allowed, false if rate-limited. Fails open if Redis is down. */
export async function rateLimit(kind: keyof typeof limiters, id: string): Promise<boolean> {
  const limiter = limiters[kind];
  if (!limiter) return true;
  try {
    const { success } = await limiter.limit(id);
    return success;
  } catch {
    return true; // never block on a rate-limiter outage
  }
}
