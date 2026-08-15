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

  // Customer layer. This runs MID-call, before the call-events webhook has
  // fired — so this is often the first thing to see the caller's number, and
  // the booking carries a name the webhook never gets. Resolved outside the
  // transaction so the slot-contention transaction stays as short as possible;
  // it's an upsert on a unique index, so racing it with the webhook path is
  // safe and both converge on the same customer.
  const { resolveCustomerSafe, refreshRollupsSafe } = await import("./customer");
  const customer = await resolveCustomerSafe(args.shopId, args.customerPhone, {
    name: args.customerName,
    at: args.now,
  });

  const outcome = await prisma.$transaction(async (tx) => {
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
        customerId: customer?.id ?? null,
        callId: args.callId || null,
        source: "agent",
        status: "confirmed",
      },
      select: { id: true, startUtc: true, service: true },
    });
    return { ok: true, booking: { id: created.id, startUtc: created.startUtc.toISOString(), service: created.service } } as const;
  });

  // Only touch rollups when a booking actually landed — an unavailable slot
  // isn't contact worth recording against the customer.
  if (outcome.ok) await refreshRollupsSafe(customer?.id);
  return outcome;
}

/** The states a booking can end in, beyond the "confirmed" it starts in. */
export const BOOKING_OUTCOMES = ["completed", "no_show", "canceled", "confirmed"] as const;
export type BookingOutcomeStatus = (typeof BOOKING_OUTCOMES)[number];

/**
 * Close out a booking: mark it completed (optionally with the actual money it
 * brought in), a no-show, or cancelled.
 *
 * This is the lifecycle that was missing when the customer layer shipped.
 * `Booking.valueCents` and the `completed`/`no_show` statuses existed in the
 * schema and were read by the rollups, but nothing anywhere ever wrote them —
 * so `lifetimeValue` could only ever fall back to the voice provider's pre-job
 * ESTIMATE, and `noShowCount` was structurally always zero. Without this, every
 * money figure in the CRM is a guess the AI made before the work happened.
 *
 * Shop-scoped by construction: the update is keyed on BOTH id and shopId, so an
 * owner can't close out another shop's booking by guessing an id.
 */
export async function setBookingOutcome(args: {
  shopId: string;
  bookingId: string;
  status: BookingOutcomeStatus;
  /** Actual value in CENTS. Only meaningful on "completed". */
  valueCents?: number | null;
}): Promise<{ ok: true; customerId: string | null } | { ok: false; reason: "not_found" }> {
  const existing = await prisma.booking.findFirst({
    where: { id: args.bookingId, shopId: args.shopId },
    select: { id: true, customerId: true },
  });
  if (!existing) return { ok: false, reason: "not_found" };

  // Value only belongs on a completed job. Moving a booking back to any other
  // status clears it rather than leaving revenue attached to work that didn't
  // happen — otherwise a mis-click stays in the lifetime total forever.
  const valueCents =
    args.status === "completed"
      ? args.valueCents != null && Number.isFinite(args.valueCents) && args.valueCents >= 0
        ? Math.round(args.valueCents)
        : null
      : null;

  await prisma.booking.update({
    where: { id: existing.id },
    data: { status: args.status, valueCents },
  });

  const { refreshRollupsSafe } = await import("./customer");
  await refreshRollupsSafe(existing.customerId);
  return { ok: true, customerId: existing.customerId };
}
