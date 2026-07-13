import { NextResponse } from "next/server";
import { verifyQStash } from "@/lib/qstash";
import { sendDunningReminders, sendAbandonmentNudges } from "@/lib/reminders";
import { reportError } from "@/lib/observability";

// QStash daily cron: escalating past-due dunning reminders + one-time nudges to
// owners who stalled mid-onboarding. Schedule via QStash, e.g. cron "0 16 * * *"
// → this URL (see SETUP.md).
export async function POST(req: Request) {
  const body = await req.text();
  if (!(await verifyQStash(req, body))) return NextResponse.json({ error: "bad signature" }, { status: 401 });
  try {
    const [dunning, nudges] = await Promise.all([sendDunningReminders(), sendAbandonmentNudges()]);
    return NextResponse.json({ ok: true, dunning, nudges });
  } catch (e) {
    await reportError(e, { source: "job", route: "jobs/reminders" });
    return NextResponse.json({ error: "reminders failed" }, { status: 500 });
  }
}
