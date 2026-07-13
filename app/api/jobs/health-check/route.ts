import { NextResponse } from "next/server";
import { verifyQStash } from "@/lib/qstash";
import { detectSilentShops } from "@/lib/health";
import { reportError } from "@/lib/observability";

// QStash daily cron: proactive voice-path health check. Pages admins when a live
// shop that was receiving calls suddenly goes silent (likely broken routing).
// Schedule via QStash, e.g. cron "0 15 * * *" → this URL (see SETUP.md).
export async function POST(req: Request) {
  const body = await req.text();
  if (!(await verifyQStash(req, body))) return NextResponse.json({ error: "bad signature" }, { status: 401 });
  try {
    const res = await detectSilentShops();
    return NextResponse.json({ ok: true, ...res });
  } catch (e) {
    await reportError(e, { source: "job", route: "jobs/health-check" });
    return NextResponse.json({ error: "health check failed" }, { status: 500 });
  }
}
