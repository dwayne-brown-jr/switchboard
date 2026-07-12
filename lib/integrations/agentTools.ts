import { signPayload } from "../secure";
import type { AgentFunction } from "./voice";

// Native agent tools — the call-time endpoints the Retell agent invokes, served
// by THIS app (app/api/agent/*) instead of the old n8n broker. Each URL carries
// the shop id and an HMAC token so the routes can authenticate the call.

/** The public app base, or null in dev/preview where the agent can't reach us. */
export function agentBaseUrl(): string | null {
  const app = process.env.APP_URL || "";
  return /^https:\/\//i.test(app) && !/localhost|127\.0\.0\.1/.test(app) ? app : null;
}

function q(shopId: string): string {
  return `?client_id=${shopId}&token=${signPayload(`agent:${shopId}`)}`;
}

export function agentFunctions(shopId: string): AgentFunction[] {
  const base = `${agentBaseUrl() ?? "http://localhost:3000"}/api/agent`;
  return [
    {
      name: "check_availability",
      url: `${base}/check-availability${q(shopId)}`,
      description: "Check open appointment times for a service before offering the caller a time.",
      parameters: { type: "object", properties: { service: { type: "string", description: "The service the caller wants." } }, required: [] },
    },
    {
      name: "create_booking",
      url: `${base}/create-booking${q(shopId)}`,
      description: "Book the appointment once the caller confirms a specific time.",
      parameters: {
        type: "object",
        properties: {
          service: { type: "string", description: "The service being booked." },
          preferred_time: { type: "string", description: "ISO 8601 start datetime the caller confirmed." },
          customer_name: { type: "string", description: "The caller's name." },
          phone: { type: "string", description: "The caller's callback number." },
        },
        required: ["preferred_time"],
      },
    },
    {
      name: "notify_owner",
      url: `${base}/notify-owner${q(shopId)}`,
      description: "Text the owner immediately about an emergency or important message.",
      parameters: { type: "object", properties: { message: { type: "string", description: "A short, clear message for the owner." } }, required: ["message"] },
    },
  ];
}

export function agentWebhookUrl(shopId: string): string | null {
  const app = agentBaseUrl();
  return app ? `${app}/api/agent/call-events${q(shopId)}` : null;
}

/**
 * Resolve a caller-named service to a Cal.com event-type id: exact →
 * case-insensitive → substring match. Only auto-picks when the shop has exactly
 * ONE bookable service; otherwise returns undefined so the caller can decide
 * whether to fall back (availability) or ask for clarification (booking).
 */
export function resolveEventType(map: Record<string, string>, service?: string): string | undefined {
  const keys = Object.keys(map);
  if (service && service.trim()) {
    if (map[service]) return map[service];
    const lc = service.trim().toLowerCase();
    const ci = keys.find((k) => k.toLowerCase() === lc);
    if (ci) return map[ci];
    // Token-overlap match (handles plurals/word order, e.g. "brakes" → "Brake
    // service"). Only accept a UNIQUE best match — ties (a shared generic token
    // like "service") stay unresolved so the caller asks to clarify.
    const svc = new Set(tokens(service));
    let best: string | undefined;
    let bestScore = 0;
    let tie = false;
    for (const k of keys) {
      const score = tokens(k).filter((t) => svc.has(t)).length;
      if (score > bestScore) {
        bestScore = score;
        best = k;
        tie = false;
      } else if (score === bestScore && score > 0) {
        tie = true;
      }
    }
    if (best && bestScore > 0 && !tie) return map[best];
  }
  // Only auto-pick when there's exactly one bookable service.
  const vals = Object.values(map);
  return vals.length === 1 ? vals[0] : undefined;
}

/** Lowercase word tokens with trailing plural "s" stripped, for fuzzy matching. */
function tokens(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.replace(/s$/, ""));
}
