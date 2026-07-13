import { NextResponse } from "next/server";
import { mobileGuard } from "../_guard";
import { getRecentCalls } from "@/lib/stats";

// Owner mobile app: recent calls feed (most recent first).
export async function GET(req: Request) {
  const g = await mobileGuard(req);
  if ("error" in g) return g.error;
  const { shop } = g.auth;
  if (!shop) return NextResponse.json({ calls: [] });

  const calls = await getRecentCalls(shop.id, 40);
  return NextResponse.json({
    calls: calls.map((c) => ({
      id: c.id,
      timestamp: c.timestamp,
      callerPhone: c.callerPhone,
      intent: c.intent,
      outcome: c.outcome,
      booked: c.booked,
      service: c.service,
      apptTime: c.apptTime,
      estJobValue: c.estJobValue,
      hotJob: c.hotJob,
      durationSec: c.durationSec,
    })),
  });
}
