import { NextResponse } from "next/server";
import { mobileGuard } from "../_guard";
import { getStats } from "@/lib/stats";
import { plan } from "@/lib/plans";

// Owner mobile app home: shop status + a 30-day performance summary. planPrice is
// included so the app can anchor booked revenue against what the owner pays
// ("that's Nx your plan") — the contrast effect.
export async function GET(req: Request) {
  const g = await mobileGuard(req);
  if ("error" in g) return g.error;
  const { user, shop } = g.auth;

  if (!shop) {
    return NextResponse.json({ owner: { email: user.email, name: user.name }, shop: null, stats: null, planPrice: null });
  }

  const stats = await getStats(shop.id, 30);
  const planPrice = plan(shop.plan ?? "")?.price ?? 149;
  return NextResponse.json({
    owner: { email: user.email, name: user.name },
    shop: {
      id: shop.id,
      businessName: shop.businessName,
      status: shop.status,
      paused: shop.status === "paused",
      agentNumber: shop.agentNumber,
      a2pStatus: shop.a2pStatus,
      subStatus: shop.subStatus,
    },
    stats,
    planPrice,
  });
}
