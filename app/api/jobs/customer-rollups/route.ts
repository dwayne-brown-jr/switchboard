import { NextResponse } from "next/server";
import { verifyQStash } from "@/lib/qstash";
import { reconcileRollups } from "@/lib/customer";
import { reportError } from "@/lib/observability";
import { pingHeartbeat } from "@/lib/heartbeat";

// QStash cron callback: reconcile customer rollups (call/booking counts,
// lifetime value, stage) against their source rows.
//
// The live call paths refresh rollups inline, but deliberately best-effort — a
// CRM write must never fail a call — so drift is expected, not exceptional.
// One kind of drift is only ever catchable here: dormancy. A customer goes
// quiet by the passage of time, and nothing writes on the day that happens, so
// without this sweep `stage` would stay "active" forever.
//
// Schedule daily, e.g. cron "30 8 * * *" → this URL. See SETUP.md.
export async function POST(req: Request) {
  const body = await req.text();
  if (!(await verifyQStash(req, body))) return NextResponse.json({ error: "bad signature" }, { status: 401 });
  try {
    const res = await reconcileRollups();
    // Success only — a thrown job must NOT ping; the missed beat is the alert.
    await pingHeartbeat("customer-rollups");
    return NextResponse.json({ ok: true, ...res });
  } catch (e) {
    await reportError(e, { source: "job", route: "jobs/customer-rollups" });
    return NextResponse.json({ error: "reconcile failed" }, { status: 500 });
  }
}
