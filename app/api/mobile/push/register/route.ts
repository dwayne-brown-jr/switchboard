import { NextResponse } from "next/server";
import { mobileGuard } from "../../_guard";
import { prisma } from "@/lib/db";

// Owner mobile app: register (or refresh) this device's Expo push token.
export async function POST(req: Request) {
  const g = await mobileGuard(req);
  if ("error" in g) return g.error;
  const { deviceId } = g.auth;

  const { pushToken, platform } = (await req.json().catch(() => ({}))) as { pushToken?: string; platform?: string };
  if (!pushToken) return NextResponse.json({ error: "pushToken required" }, { status: 400 });

  await prisma.deviceToken.update({
    where: { id: deviceId },
    data: { pushToken, platform: platform ?? undefined },
  });
  return NextResponse.json({ ok: true });
}
