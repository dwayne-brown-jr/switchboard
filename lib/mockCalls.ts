import { prisma } from "./db";
import type { ShopConfig } from "./schemas";
import { verticalDef } from "./verticals";

// Generates realistic sample CallRecords so the owner dashboard and weekly
// digest are demoable without a live n8n feed. Dev/admin utility only.

const INTENTS = ["booking", "price question", "hours", "existing appointment", "emergency", "general question"];
const CALLER_AREACODES = ["512", "737", "210", "469"];

function rand<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}
function randInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
function fakePhone() {
  return `+1${rand(CALLER_AREACODES)}${randInt(200, 999)}${randInt(1000, 9999)}`;
}

export async function seedMockCalls(shopId: string, count = 40): Promise<number> {
  const version = await prisma.agentVersion.findFirst({
    where: { shopId, status: { in: ["live", "approved"] } },
    orderBy: { createdAt: "desc" },
  });
  const config = version?.config as unknown as ShopConfig | undefined;
  const def = verticalDef(config?.vertical ?? "auto");
  const services = (config?.services ?? def.services).filter((s) => s.bookable).map((s) => s.service);
  const valueMap = config?.service_value_map ?? def.serviceValueMap;
  const hotRules = config?.hot_job_rules ?? def.hotJobRules;

  const now = Date.now();
  let created = 0;

  for (let i = 0; i < count; i++) {
    // Spread across the last 14 days.
    const ts = new Date(now - randInt(0, 14 * 24 * 60) * 60 * 1000);
    const hour = ts.getHours();
    const afterHours = hour < 8 || hour >= 18;
    const roll = Math.random();

    let outcome: string, booked = false, hotJob = false, recovered = false, estJobValue = 0, service: string | null = null, apptTime: string | null = null;
    let intent = rand(INTENTS);

    if (roll < 0.45) {
      // booked a job
      outcome = "booked";
      booked = true;
      service = rand(services) ?? "Service visit";
      estJobValue = valueMap[service] ?? def.avgTicket;
      apptTime = new Date(ts.getTime() + randInt(1, 5) * 24 * 60 * 60 * 1000).toISOString();
      intent = "booking";
    } else if (roll < 0.6) {
      // emergency escalated
      outcome = "escalated";
      hotJob = true;
      intent = "emergency";
      service = null;
    } else if (roll < 0.75) {
      // missed call recovered (called back / texted)
      outcome = "missed_recovered";
      recovered = true;
      intent = "booking";
    } else if (roll < 0.9) {
      outcome = "message";
      intent = rand(["price question", "hours", "general question"]);
    } else {
      outcome = "no_action";
    }

    try {
      await prisma.callRecord.create({
        data: {
          shopId,
          callId: `mock_${shopId}_${now}_${i}`,
          timestamp: ts,
          afterHours,
          durationSec: randInt(35, 240),
          callerPhone: fakePhone(),
          intent,
          outcome,
          booked,
          service,
          apptTime,
          estJobValue,
          hotJob,
          recovered,
          flags: hotJob ? { hotJobRule: rand(hotRules) } : undefined,
        },
      });
      created++;
    } catch {
      /* skip dup */
    }
  }
  return created;
}

export async function clearMockCalls(shopId: string): Promise<number> {
  const res = await prisma.callRecord.deleteMany({ where: { shopId, callId: { startsWith: `mock_${shopId}_` } } });
  return res.count;
}
