import { NextResponse } from "next/server";
import { authAgentShop } from "@/lib/agentAuth";
import { createBooking } from "@/lib/integrations/calcom";
import { resolveEventType } from "@/lib/integrations/agentTools";
import { naiveLocalToUtc } from "@/lib/datetime";
import { rateLimit } from "@/lib/ratelimit";

// Agent tool: book an appointment once the caller confirms a time.
export async function POST(req: Request) {
  const shop = await authAgentShop(new URL(req.url));
  if (!shop) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!(await rateLimit("agentTool", shop.id))) {
    return NextResponse.json({ booked: false, message: "One moment — please try again shortly." });
  }

  const body = (await req.json().catch(() => ({}))) as { args?: Record<string, string>; [k: string]: unknown };
  const a = (body.args ?? body ?? {}) as Record<string, string>;
  const map = (shop.calEventTypeMap as Record<string, string> | null) ?? {};

  // Strict: never silently book the wrong service. If the caller named a service
  // that doesn't resolve (and the shop has more than one), ask to confirm.
  const eventTypeId = resolveEventType(map, a.service);
  const rawStart = a.preferred_time || a.start;
  if (!eventTypeId) {
    return NextResponse.json({ booked: false, message: "Which service should I book you for?" });
  }
  if (!rawStart) {
    return NextResponse.json({ booked: false, message: "What day and time works for you?" });
  }

  const start = naiveLocalToUtc(rawStart, shop.timezone);
  try {
    const booking = await createBooking({
      eventTypeId,
      start,
      name: a.customer_name || a.name || "",
      phone: a.phone || "",
      timezone: shop.timezone,
      service: a.service || "",
    });
    return NextResponse.json({ booked: true, booking });
  } catch (e) {
    const { reportError } = await import("@/lib/observability");
    await reportError(e, { source: "request", route: "/api/agent/create-booking", shopId: shop.id });
    return NextResponse.json({ booked: false, message: "I couldn't complete the booking just now — the team will follow up." });
  }
}
