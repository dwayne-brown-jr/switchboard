import { NextResponse } from "next/server";
import { mobileGuard } from "../_guard";
import { prisma } from "@/lib/db";

// Owner mobile app: upcoming confirmed appointments (soonest first). Includes a
// small recent-past window so a just-finished job doesn't vanish mid-day.
export async function GET(req: Request) {
  const g = await mobileGuard(req);
  if ("error" in g) return g.error;
  const { shop } = g.auth;
  if (!shop) return NextResponse.json({ appointments: [] });

  const since = new Date(Date.now() - 2 * 60 * 60 * 1000); // 2h grace for in-progress jobs
  const rows = await prisma.booking.findMany({
    where: { shopId: shop.id, status: "confirmed", startUtc: { gte: since } },
    orderBy: { startUtc: "asc" },
    take: 50,
  });

  return NextResponse.json({
    appointments: rows.map((b) => ({
      id: b.id,
      startUtc: b.startUtc,
      endUtc: b.endUtc,
      service: b.service,
      customerName: b.customerName,
      customerPhone: b.customerPhone,
      source: b.source,
    })),
  });
}
