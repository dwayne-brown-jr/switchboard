import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { authAgentShop } from "@/lib/agentAuth";
import { callIngestSchema } from "@/lib/schemas";
import type { ShopConfig } from "@/lib/schemas";
import { recordCall, mapRetellCall } from "@/lib/ingest";
import { reportError } from "@/lib/observability";

// Agent webhook: Retell posts the call-ended event here. We map it to a
// CallRecord (using the live version's service value map for revenue estimates)
// and store it via the shared recordCall(), which also fires the owner backstop.
export async function POST(req: Request) {
  const shop = await authAgentShop(new URL(req.url));
  if (!shop) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // This is the core call-logging path — a throw here would silently lose the
  // record. Capture + return 500 so Retell retries (recordCall is idempotent).
  try {
    const body = await req.json().catch(() => ({}));
    const version = await prisma.agentVersion.findFirst({
      where: { shopId: shop.id, status: { in: ["live", "approved"] } },
      orderBy: { createdAt: "desc" },
      select: { config: true },
    });
    const config = version?.config as unknown as ShopConfig | undefined;
    const valueMap = config?.service_value_map ?? {};

    const parsed = callIngestSchema.safeParse(mapRetellCall(shop.id, body, valueMap));
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: "could not map call" });
    }
    await recordCall(shop, parsed.data);
    return NextResponse.json({ ok: true });
  } catch (e) {
    await reportError(e, { source: "webhook", route: "agent/call-events", shopId: shop.id });
    return NextResponse.json({ error: "record failed" }, { status: 500 });
  }
}
