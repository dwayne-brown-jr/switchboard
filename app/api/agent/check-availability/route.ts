import { NextResponse } from "next/server";
import { authAgentShop } from "@/lib/agentAuth";
import { getLiveConfig, getBusyIntervals } from "@/lib/booking";
import { generateOpenSlots, serviceDuration } from "@/lib/scheduling";
import { rateLimit } from "@/lib/ratelimit";

// Agent tool: check open appointment times. Availability is computed from THIS
// shop's business hours minus THIS shop's own bookings (our DB) — so one shop's
// calendar can never affect another's. Returns 200 with a message even on
// failure so the voice agent can gracefully tell the caller.
export async function POST(req: Request) {
  const shop = await authAgentShop(new URL(req.url));
  if (!shop) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!(await rateLimit("agentTool", shop.id))) {
    return NextResponse.json({ available: null, message: "One moment — please try again shortly." });
  }

  const body = (await req.json().catch(() => ({}))) as { args?: Record<string, string> } & Record<string, string>;
  const a = (body.args ?? body ?? {}) as Record<string, string>;

  try {
    const config = await getLiveConfig(shop.id);
    if (!config) {
      return NextResponse.json({ available: null, message: "No bookable services are set up yet." });
    }
    const now = new Date();
    const busy = await getBusyIntervals(shop.id, now);
    // Offer times sized to the requested service so a long job (e.g. a full
    // detail) only surfaces slots where the whole appointment fits, and capacity
    // (concurrent jobs) + travel buffer are honored.
    const slots = generateOpenSlots({
      hours: config.hours,
      timezone: shop.timezone,
      busy,
      now,
      durationMin: serviceDuration(config, a.service),
      capacity: config.capacity,
      bufferMin: config.buffer_min,
    });
    return NextResponse.json({ available: slots });
  } catch (e) {
    const { reportError } = await import("@/lib/observability");
    await reportError(e, { source: "request", route: "/api/agent/check-availability", shopId: shop.id });
    return NextResponse.json({ available: null, message: "I'm having trouble checking the calendar right now." });
  }
}
