import { NextResponse } from "next/server";
import { verifyQStash } from "@/lib/qstash";
import { sendAllDigests } from "@/lib/digest";
import { reportError } from "@/lib/observability";

// QStash weekly-cron callback: emails the digest to every live shop.
// Schedule once via QStash (see SETUP.md): cron "0 14 * * 1" → this URL.
export async function POST(req: Request) {
  const body = await req.text();
  if (!(await verifyQStash(req, body))) return NextResponse.json({ error: "bad signature" }, { status: 401 });
  try {
    const res = await sendAllDigests();
    return NextResponse.json({ ok: true, ...res });
  } catch (e) {
    await reportError(e, { source: "job", route: "jobs/weekly-digest" });
    return NextResponse.json({ error: "digest failed" }, { status: 500 });
  }
}
