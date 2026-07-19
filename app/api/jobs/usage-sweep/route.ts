import { NextResponse } from "next/server";
import { verifyQStash } from "@/lib/qstash";
import { sweepUsageOverages } from "@/lib/usage";
import { reportError } from "@/lib/observability";
import { pingHeartbeat } from "@/lib/heartbeat";

// QStash cron callback: find live shops that have run past their plan's included
// minutes and either auto-scale them to the next tier (when USAGE_AUTOBUMP=on) or
// alert the operator to bump manually. Protects gross margin from high-volume
// shops on a flat plan. Schedule daily, e.g. cron "0 8 * * *" → this URL.
export async function POST(req: Request) {
  const body = await req.text();
  if (!(await verifyQStash(req, body))) return NextResponse.json({ error: "bad signature" }, { status: 401 });
  try {
    const res = await sweepUsageOverages();
    // Success only — a thrown job must NOT ping; the missed beat is the alert.
    await pingHeartbeat("usage-sweep");
    return NextResponse.json({ ok: true, ...res });
  } catch (e) {
    await reportError(e, { source: "job", route: "jobs/usage-sweep" });
    return NextResponse.json({ error: "sweep failed" }, { status: 500 });
  }
}
