import { NextResponse } from "next/server";
import { verifyQStash } from "@/lib/qstash";
import { reclaimCanceledNumbers } from "@/lib/lifecycle";
import { reportError } from "@/lib/observability";

// QStash daily cron: permanently release the Twilio numbers of shops that have
// stayed canceled past the grace window (CANCEL_GRACE_DAYS), so churned shops
// stop costing the platform the monthly number fee. Schedule via QStash, e.g.
// cron "0 3 * * *" → this URL (see SETUP.md).
export async function POST(req: Request) {
  const body = await req.text();
  if (!(await verifyQStash(req, body))) return NextResponse.json({ error: "bad signature" }, { status: 401 });
  try {
    const res = await reclaimCanceledNumbers();
    return NextResponse.json({ ok: true, ...res });
  } catch (e) {
    await reportError(e, { source: "job", route: "jobs/reclaim-numbers" });
    return NextResponse.json({ error: "reclaim failed" }, { status: 500 });
  }
}
