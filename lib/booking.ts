import "server-only";
import { prisma } from "./db";
import { isSlotAvailable, SLOT_MINUTES, type Busy } from "./scheduling";
import { fuzzyMatchKey } from "./match-service";
import type { ShopConfig } from "./schemas";

// Server-side booking store. Switchboard owns availability: slots come from the
// shop's live config hours minus this shop's own confirmed bookings, all in our
// DB. No shared external calendar → no cross-shop collision.

/** The live (or latest approved) structured config for a shop, if any. */
export async function getLiveConfig(shopId: string): Promise<ShopConfig | null> {
  const version = await prisma.agentVersion.findFirst({
    where: { shopId, status: { in: ["live", "approved"] } },
    orderBy: { createdAt: "desc" },
    select: { config: true },
  });
  return (version?.config as unknown as ShopConfig) ?? null;
}

/** This shop's confirmed bookings that haven't ended yet — its busy intervals. */
export async function getBusyIntervals(shopId: string, from: Date): Promise<Busy[]> {
  const rows = await prisma.booking.findMany({
    where: { shopId, status: "confirmed", endUtc: { gt: from } },
    select: { startUtc: true, endUtc: true },
  });
  return rows.map((r) => ({ startUtc: r.startUtc, endUtc: r.endUtc }));
}

export type BookingOutcome =
  | { ok: true; booking: { id: string; startUtc: string; service: string | null } }
  | { ok: false; reason: "unavailable" };

/**
 * Book a confirmed slot, re-validating availability inside a transaction so two
 * near-simultaneous calls can't double-book the same time. Returns
 * `{ ok:false, reason:"unavailable" }` if the time isn't (or is no longer) open.
 */
export async function createConfirmedBooking(args: {
  shopId: string;
  config: ShopConfig;
  timezone: string | null;
  startUtc: Date;
  now: Date;
  service?: string;
  customerName?: string;
  customerPhone?: string;
  callId?: string;
}): Promise<BookingOutcome> {
  const endUtc = new Date(args.startUtc.getTime() + SLOT_MINUTES * 60_000);
  // Normalize the caller's free-text service to the shop's catalog name when it
  // clearly matches one ("routine oil change for my BMW" → "Oil change"), so
  // bookings, the dashboard, and revenue estimates all speak the same names.
  // Ambiguous or novel requests keep the caller's own words.
  const rawService = args.service?.trim() || null;
  const service = rawService ? (fuzzyMatchKey(args.config.services.map((s) => s.service), rawService) ?? rawService) : null;
  return prisma.$transaction(async (tx) => {
    const rows = await tx.booking.findMany({
      where: { shopId: args.shopId, status: "confirmed", endUtc: { gt: args.now } },
      select: { startUtc: true, endUtc: true },
    });
    const busy: Busy[] = rows.map((r) => ({ startUtc: r.startUtc, endUtc: r.endUtc }));
    if (!isSlotAvailable({ hours: args.config.hours, timezone: args.timezone, busy, startUtc: args.startUtc, now: args.now })) {
      return { ok: false, reason: "unavailable" } as const;
    }
    const created = await tx.booking.create({
      data: {
        shopId: args.shopId,
        startUtc: args.startUtc,
        endUtc,
        service,
        customerName: args.customerName?.trim() || null,
        customerPhone: args.customerPhone?.trim() || null,
        callId: args.callId || null,
        source: "agent",
        status: "confirmed",
      },
      select: { id: true, startUtc: true, service: true },
    });
    return { ok: true, booking: { id: created.id, startUtc: created.startUtc.toISOString(), service: created.service } } as const;
  });
}
