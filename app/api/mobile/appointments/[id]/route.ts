import { NextResponse } from "next/server";
import { mobileGuard } from "../../_guard";
import { prisma } from "@/lib/db";
import { logAudit } from "@/lib/audit";

// Owner mobile app: cancel an appointment (or remove a block-off). Canceling
// frees the slot immediately — availability only counts "confirmed" rows.
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await mobileGuard(req);
  if ("error" in g) return g.error;
  const { shop, user } = g.auth;
  const { id } = await params;

  const body = (await req.json().catch(() => ({}))) as { action?: string };
  if (body.action !== "cancel") {
    return NextResponse.json({ error: "action must be \"cancel\"" }, { status: 400 });
  }

  const booking = shop ? await prisma.booking.findFirst({ where: { id, shopId: shop.id } }) : null;
  if (!booking) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (booking.status !== "confirmed") return NextResponse.json({ ok: true, status: booking.status });

  await prisma.booking.update({ where: { id: booking.id }, data: { status: "canceled" } });
  await logAudit(shop!.id, user.id, booking.source === "owner_block" ? "block.removed" : "booking.canceled", {
    bookingId: booking.id,
    startUtc: booking.startUtc,
  });
  return NextResponse.json({ ok: true, status: "canceled" });
}
