import { NextResponse } from "next/server";
import { authAgentShop } from "@/lib/agentAuth";
import { createBooking } from "@/lib/integrations/calcom";

// Agent tool: book an appointment once the caller confirms a time.
export async function POST(req: Request) {
  const shop = await authAgentShop(new URL(req.url));
  if (!shop) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { args?: Record<string, string>; [k: string]: unknown };
  const a = (body.args ?? body ?? {}) as Record<string, string>;
  const map = (shop.calEventTypeMap as Record<string, string> | null) ?? {};
  const eventTypeId = (a.service && map[a.service]) || Object.values(map)[0];
  const start = a.preferred_time || a.start;
  if (!eventTypeId || !start) {
    return NextResponse.json({ booked: false, message: "I still need the service and a specific time to book." });
  }
  try {
    const booking = await createBooking({
      eventTypeId,
      start,
      name: a.customer_name || a.name || "",
      phone: a.phone || "",
      timezone: shop.timezone,
    });
    return NextResponse.json({ booked: true, booking });
  } catch (e) {
    const { reportError } = await import("@/lib/observability");
    await reportError(e, { source: "request", route: "/api/agent/create-booking", shopId: shop.id });
    return NextResponse.json({ booked: false, message: "I couldn't complete the booking just now — the team will follow up." });
  }
}
