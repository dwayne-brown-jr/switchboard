import { NextResponse } from "next/server";
import { authAgentShop } from "@/lib/agentAuth";
import { getLiveConfig, createConfirmedBooking } from "@/lib/booking";
import { naiveLocalToUtc } from "@/lib/datetime";
import { rateLimit } from "@/lib/ratelimit";

// Agent tool: book an appointment once the caller confirms a time. The slot is
// re-validated against this shop's hours + own bookings (in a transaction) so we
// never confirm a time that's closed, past, or already taken.
export async function POST(req: Request) {
  const shop = await authAgentShop(new URL(req.url));
  if (!shop) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!(await rateLimit("agentTool", shop.id))) {
    return NextResponse.json({ booked: false, message: "One moment — please try again shortly." });
  }

  const body = (await req.json().catch(() => ({}))) as { args?: Record<string, string>; [k: string]: unknown };
  const a = (body.args ?? body ?? {}) as Record<string, string>;
  const rawStart = a.preferred_time || a.start;
  if (!rawStart) {
    return NextResponse.json({ booked: false, message: "What day and time works for you?" });
  }

  try {
    const config = await getLiveConfig(shop.id);
    if (!config) {
      return NextResponse.json({ booked: false, message: "Booking isn't set up yet — the team will follow up." });
    }
    const now = new Date();
    const startUtc = new Date(naiveLocalToUtc(rawStart, shop.timezone));
    const result = await createConfirmedBooking({
      shopId: shop.id,
      config,
      timezone: shop.timezone,
      startUtc,
      now,
      service: a.service,
      customerName: a.customer_name || a.name,
      customerPhone: a.phone,
    });
    if (!result.ok) {
      return NextResponse.json({ booked: false, message: "That time isn't open — would another time work?" });
    }
    return NextResponse.json({ booked: true, booking: result.booking });
  } catch (e) {
    const { reportError } = await import("@/lib/observability");
    await reportError(e, { source: "request", route: "/api/agent/create-booking", shopId: shop.id });
    return NextResponse.json({ booked: false, message: "I couldn't complete the booking just now — the team will follow up." });
  }
}
