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
