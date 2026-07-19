import { NextResponse } from "next/server";
import { verifyQStash } from "@/lib/qstash";
import { sweepStalledRuns } from "@/lib/sweep";
import { reportError } from "@/lib/observability";
import { pingHeartbeat } from "@/lib/heartbeat";

// QStash cron callback: self-heal onboarding runs whose progress signal was lost
// (missed Stripe webhook, crashed auto pass) and surface genuinely-stuck runs.
// Schedule via QStash, e.g. cron "*/30 * * * *" → this URL (see SETUP.md).
export async function POST(req: Request) {
  const body = await req.text();
  if (!(await verifyQStash(req, body))) return NextResponse.json({ error: "bad signature" }, { status: 401 });
  try {
    const res = await sweepStalledRuns();
    // Success only — a thrown job must NOT ping; the missed beat is the alert.
    await pingHeartbeat("onboarding-sweep");
    return NextResponse.json({ ok: true, ...res });
  } catch (e) {
    await reportError(e, { source: "job", route: "jobs/onboarding-sweep" });
    return NextResponse.json({ error: "sweep failed" }, { status: 500 });
  }
}
