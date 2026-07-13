import { NextResponse } from "next/server";
import { mobileGuard } from "../_guard";
import { pauseShopAgent, resumeShopAgent } from "@/lib/lifecycle";
import { prisma } from "@/lib/db";

// Owner mobile app: pause or resume the receptionist. POST { paused: boolean }.
export async function POST(req: Request) {
  const g = await mobileGuard(req);
  if ("error" in g) return g.error;
  const { shop, user } = g.auth;
  if (!shop) return NextResponse.json({ error: "no shop" }, { status: 400 });

  const { paused } = (await req.json().catch(() => ({}))) as { paused?: boolean };
  if (typeof paused !== "boolean") return NextResponse.json({ error: "paused (boolean) required" }, { status: 400 });

  if (paused) await pauseShopAgent(shop.id, "paused from mobile app", user.id);
  else await resumeShopAgent(shop.id, user.id);

  const fresh = await prisma.shop.findUnique({ where: { id: shop.id }, select: { status: true } });
  return NextResponse.json({ ok: true, status: fresh?.status, paused: fresh?.status === "paused" });
}
