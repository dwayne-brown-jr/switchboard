import { NextResponse } from "next/server";
import { mobileGuard } from "../../_guard";
import { prisma } from "@/lib/db";

// Owner mobile app: one call's full detail (incl. transcript, which is too
// heavy for the list payload), and marking its follow-up handled.

type Params = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: Params) {
  const g = await mobileGuard(req);
  if ("error" in g) return g.error;
  const { shop } = g.auth;
  const { id } = await params;

  const call = shop ? await prisma.callRecord.findFirst({ where: { id, shopId: shop.id } }) : null;
  if (!call) return NextResponse.json({ error: "not found" }, { status: 404 });

  return NextResponse.json({
    call: {
      id: call.id,
      timestamp: call.timestamp,
      callerPhone: call.callerPhone,
      intent: call.intent,
      outcome: call.outcome,
      booked: call.booked,
      service: call.service,
      apptTime: call.apptTime,
      estJobValue: call.estJobValue,
      hotJob: call.hotJob,
      durationSec: call.durationSec,
      recordingUrl: call.transcriptUrl,
      summary: call.summary,
      transcript: call.transcript,
      handledAt: call.handledAt,
    },
  });
}

export async function PATCH(req: Request, { params }: Params) {
  const g = await mobileGuard(req);
  if ("error" in g) return g.error;
  const { shop } = g.auth;
  const { id } = await params;

  const body = (await req.json().catch(() => ({}))) as { handled?: boolean };
  if (typeof body.handled !== "boolean") {
    return NextResponse.json({ error: "handled (boolean) required" }, { status: 400 });
  }

  const call = shop ? await prisma.callRecord.findFirst({ where: { id, shopId: shop.id }, select: { id: true } }) : null;
  if (!call) return NextResponse.json({ error: "not found" }, { status: 404 });

  const updated = await prisma.callRecord.update({
    where: { id: call.id },
    data: { handledAt: body.handled ? new Date() : null },
    select: { id: true, handledAt: true },
  });
  return NextResponse.json({ ok: true, id: updated.id, handledAt: updated.handledAt });
}
