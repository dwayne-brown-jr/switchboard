import { NextResponse } from "next/server";
import { verifyQStash } from "@/lib/qstash";
import { pollA2P } from "@/lib/a2p";
import { reportError } from "@/lib/observability";

// QStash callback: poll A2P approval status; flips SMS on / notifies / re-polls.
export async function POST(req: Request) {
  const body = await req.text();
  if (!(await verifyQStash(req, body))) return NextResponse.json({ error: "bad signature" }, { status: 401 });
  const { shopId } = JSON.parse(body || "{}") as { shopId?: string };
  try {
    if (shopId) await pollA2P(shopId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    await reportError(e, { source: "job", route: "jobs/a2p-poll", shopId });
    return NextResponse.json({ error: "poll failed" }, { status: 500 });
  }
}
