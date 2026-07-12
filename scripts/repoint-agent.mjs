// Re-point an existing Retell agent from the old n8n broker to the native
// /api/agent/* routes. One-off migration for shops provisioned before the
// broker was retired. Reads RETELL_API_KEY, AUTH_SECRET, APP_URL from env
// (pull prod env first: `vercel env pull <file> --environment=production`).
//
//   node scripts/repoint-agent.mjs <shopId> <agentId>
import crypto from "node:crypto";

const [shopId, agentId] = process.argv.slice(2);
if (!shopId || !agentId) throw new Error("usage: repoint-agent.mjs <shopId> <agentId>");

const KEY = process.env.RETELL_API_KEY;
const SECRET = process.env.AUTH_SECRET;
const APP = (process.env.APP_URL || "").replace(/\/$/, "");
if (!KEY || !SECRET || !/^https:\/\//.test(APP)) throw new Error("need RETELL_API_KEY, AUTH_SECRET, https APP_URL in env");

const token = crypto.createHmac("sha256", SECRET).update(`agent:${shopId}`).digest("hex").slice(0, 32);
const q = `?client_id=${shopId}&token=${token}`;
const base = `${APP}/api/agent`;

const tools = [
  { type: "custom", name: "check_availability", description: "Check open appointment times for a service before offering the caller a time.", url: `${base}/check-availability${q}`, parameters: { type: "object", properties: { service: { type: "string", description: "The service the caller wants." } }, required: [] }, speak_during_execution: true, speak_after_execution: true },
  { type: "custom", name: "create_booking", description: "Book the appointment once the caller confirms a specific time.", url: `${base}/create-booking${q}`, parameters: { type: "object", properties: { service: { type: "string" }, preferred_time: { type: "string", description: "ISO 8601 start datetime." }, customer_name: { type: "string" }, phone: { type: "string" } }, required: ["preferred_time"] }, speak_during_execution: false, speak_after_execution: true },
  { type: "custom", name: "notify_owner", description: "Text the owner immediately about an emergency or important message.", url: `${base}/notify-owner${q}`, parameters: { type: "object", properties: { message: { type: "string", description: "A short, clear message for the owner." } }, required: ["message"] }, speak_during_execution: false, speak_after_execution: true },
];
const webhookUrl = `${base}/call-events${q}`;

async function api(path, method, body) {
  const res = await fetch(`https://api.retellai.com${path}`, {
    method,
    headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`${method} ${path} ${res.status}: ${await res.text().catch(() => "")}`);
  return res.json();
}

const agent = await api(`/get-agent/${agentId}`, "GET");
const llmId = agent.response_engine?.llm_id || agent.metadata?.llm_id;
if (!llmId) throw new Error("could not find llm_id on agent");
console.log("llm_id:", llmId);

await api(`/update-retell-llm/${llmId}`, "PATCH", { general_tools: tools });
console.log("✓ updated LLM tools → native routes");

await api(`/update-agent/${agentId}`, "PATCH", { webhook_url: webhookUrl });
console.log("✓ updated agent webhook_url → native call-events");
console.log("done — agent now points at", base);
