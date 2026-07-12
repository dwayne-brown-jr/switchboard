import { NextResponse } from "next/server";
import { authAgentShop } from "@/lib/agentAuth";
import { getSlots } from "@/lib/integrations/calcom";

// Agent tool: check open appointment times. Returns 200 with a message even on
// failure so the voice agent can gracefully tell the caller.
export async function POST(req: Request) {
  const shop = await authAgentShop(new URL(req.url));
  if (!shop) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { args?: Record<string, string> } & Record<string, string>;
  const a = (body.args ?? body ?? {}) as Record<string, string>;
  const map = (shop.calEventTypeMap as Record<string, string> | null) ?? {};
  const eventTypeId: string | undefined = (a.service && map[a.service]) || Object.values(map)[0];
  if (!eventTypeId) {
    return NextResponse.json({ available: null, message: "No bookable services are set up yet." });
  }
  try {
    const slots = await getSlots(eventTypeId);
    return NextResponse.json({ available: slots });
  } catch (e) {
    const { reportError } = await import("@/lib/observability");
    await reportError(e, { source: "request", route: "/api/agent/check-availability", shopId: shop.id });
    return NextResponse.json({ available: null, message: "I'm having trouble checking the calendar right now." });
  }
}
