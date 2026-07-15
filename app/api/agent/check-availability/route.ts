import { NextResponse } from "next/server";
import { authAgentShop } from "@/lib/agentAuth";
import { resolveProvider } from "@/lib/schedulingProvider";
import { rateLimit } from "@/lib/ratelimit";

// Agent tool: check open appointment times. Delegates to the shop's scheduling
// provider (native by default, or the owner's own calendar). Returns 200 with a
// message even on failure so the voice agent can gracefully tell the caller.
export async function POST(req: Request) {
  const shop = await authAgentShop(new URL(req.url));
  if (!shop) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!(await rateLimit("agentTool", shop.id))) {
    return NextResponse.json({ available: null, message: "One moment — please try again shortly." });
  }

  const body = (await req.json().catch(() => ({}))) as { args?: Record<string, string> } & Record<string, string>;
  const a = (body.args ?? body ?? {}) as Record<string, string>;

  try {
    const provider = resolveProvider(shop);
    const result = await provider.getAvailability(shop, { service: a.service, now: new Date() });
    if (!result.ok) return NextResponse.json({ available: null, message: result.message });
    return NextResponse.json({ available: result.slots });
  } catch (e) {
    const { reportError } = await import("@/lib/observability");
    await reportError(e, { source: "request", route: "/api/agent/check-availability", shopId: shop.id });
    return NextResponse.json({ available: null, message: "I'm having trouble checking the calendar right now." });
  }
}
