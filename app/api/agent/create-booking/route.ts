import { NextResponse } from "next/server";
import { authAgentShop } from "@/lib/agentAuth";
import { resolveProvider } from "@/lib/schedulingProvider";
import { naiveLocalToUtc } from "@/lib/datetime";
import { rateLimit } from "@/lib/ratelimit";

// Agent tool: book an appointment once the caller confirms a time. Delegates to
// the shop's scheduling provider (native re-validates against hours + own
// bookings in a transaction; an external provider writes to the owner's calendar)
// so we never confirm a time that's closed, past, or already taken.
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
    const provider = resolveProvider(shop);
    const result = await provider.createBooking(shop, {
      service: a.service,
      startUtc: new Date(naiveLocalToUtc(rawStart, shop.timezone)),
      now: new Date(),
      customerName: a.customer_name || a.name,
      customerPhone: a.phone,
    });
    if (!result.ok) return NextResponse.json({ booked: false, message: result.message });
    return NextResponse.json({ booked: true, booking: result.booking });
  } catch (e) {
    const { reportError } = await import("@/lib/observability");
    await reportError(e, { source: "request", route: "/api/agent/create-booking", shopId: shop.id });
    return NextResponse.json({ booked: false, message: "I couldn't complete the booking just now — the team will follow up." });
  }
}
