import { NextResponse } from "next/server";
import { verifyQStash } from "@/lib/qstash";
import { markTimedOut } from "@/lib/forwarding";
import { reportError } from "@/lib/observability";

// QStash callback: 2 minutes after a verification starts, fail it if still pending.
export async function POST(req: Request) {
  const body = await req.text();
  if (!(await verifyQStash(req, body))) return NextResponse.json({ error: "bad signature" }, { status: 401 });
  const { shopId } = JSON.parse(body || "{}") as { shopId?: string };
  try {
    if (shopId) await markTimedOut(shopId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    await reportError(e, { source: "job", route: "jobs/forwarding-timeout", shopId });
    return NextResponse.json({ error: "timeout job failed" }, { status: 500 });
  }
}
