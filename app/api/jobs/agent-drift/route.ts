import { NextResponse } from "next/server";
import { verifyQStash } from "@/lib/qstash";
import { checkAllAgents, summarizeDrift } from "@/lib/agent-drift";
import { reportError } from "@/lib/observability";
import { pingHeartbeat } from "@/lib/heartbeat";

// QStash cron callback: does every live agent still match the code?
//
// The failure this catches is invisible from inside the app. Config defined in
// code — tools, post-call analysis fields, the prompt's baked sections — lives
// in the voice provider's system, and twice it reached only newly-provisioned
// shops because it was sent at creation and never on update. Nothing threw. The
// agent simply lacked a capability the code assumed, and it took a live call to
// notice.
//
// Runs daily. Drift is reported as a warning rather than an error: it means a
// shop is missing an improvement, not that its phone is down.
//
// Schedule "0 9 * * *". See SETUP.md.
export async function POST(req: Request) {
  const body = await req.text();
  if (!(await verifyQStash(req, body))) return NextResponse.json({ error: "bad signature" }, { status: 401 });
  try {
    const { checked, issues } = await checkAllAgents();

    if (issues.length > 0) {
      await reportError(new Error(summarizeDrift(issues)), {
        source: "job",
        route: "jobs/agent-drift",
        level: "warn",
      });
    }

    // Success = the check RAN. Finding drift is a working outcome, not a
    // failure — the heartbeat is about whether we're still looking.
    await pingHeartbeat("agent-drift");
    return NextResponse.json({ ok: true, checked, issues: issues.length, detail: issues });
  } catch (e) {
    await reportError(e, { source: "job", route: "jobs/agent-drift" });
    return NextResponse.json({ error: "drift check failed" }, { status: 500 });
  }
}
