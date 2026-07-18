import { NextResponse } from "next/server";
import { mobileGuard } from "../../_guard";
import { prisma } from "@/lib/db";
import { logAudit } from "@/lib/audit";

// Owner mobile app: block off time so the agent stops offering it. Stored as a
// confirmed Booking with source "owner_block" — availability already treats
// every confirmed row as busy, so no scheduling changes are needed.
const MAX_BLOCK_HOURS = 24 * 14; // sanity cap: two weeks

export async function POST(req: Request) {
  const g = await mobileGuard(req);
  if ("error" in g) return g.error;
  const { shop, user } = g.auth;
  if (!shop) return NextResponse.json({ error: "no shop" }, { status: 400 });

  const body = (await req.json().catch(() => ({}))) as { startUtc?: string; endUtc?: string; note?: string };
  const startUtc = body.startUtc ? new Date(body.startUtc) : null;
  const endUtc = body.endUtc ? new Date(body.endUtc) : null;
  if (!startUtc || !endUtc || isNaN(+startUtc) || isNaN(+endUtc) || endUtc <= startUtc) {
    return NextResponse.json({ error: "startUtc and endUtc (ISO, end after start) required" }, { status: 400 });
  }
  if (+endUtc - +startUtc > MAX_BLOCK_HOURS * 3600_000) {
    return NextResponse.json({ error: "Block is too long — two weeks max." }, { status: 400 });
  }
  if (endUtc <= new Date()) {
    return NextResponse.json({ error: "That time is already past." }, { status: 400 });
  }

  const block = await prisma.booking.create({
    data: {
      shopId: shop.id,
      startUtc,
      endUtc,
      service: (body.note ?? "").trim().slice(0, 80) || "Blocked off",
      status: "confirmed",
      source: "owner_block",
    },
    select: { id: true, startUtc: true, endUtc: true },
  });
  await logAudit(shop.id, user.id, "block.created", { bookingId: block.id, startUtc, endUtc });
  return NextResponse.json({ ok: true, block });
}
