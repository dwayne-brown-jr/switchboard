import "server-only";
import type { ShopWithOwner } from "./ingest";
import type { SlotResult } from "./scheduling";
import { getLiveConfig, getBusyIntervals, createConfirmedBooking, type BookingOutcome } from "./booking";
import { generateOpenSlots, serviceDuration } from "./scheduling";

// Scheduling provider seam. The agent's two tool routes talk to a
// SchedulingProvider, not to a specific calendar — so a shop can be backed by
// Switchboard's own scheduler (default) OR the tool the owner already uses
// (Google Calendar, etc.). The shared engine (hours + capacity + duration in
// lib/scheduling) stays common; a provider only swaps the BUSY SOURCE (what's
// already booked) and the BOOKING SINK (where a new appointment is written).

export type AvailabilityResult =
  | { ok: true; slots: SlotResult }
  | { ok: false; reason: "not_configured" | "provider_error"; message: string };

export type BookResult =
  | { ok: true; booking: { id: string; startUtc: string; service: string | null } }
  | { ok: false; reason: "not_configured" | "unavailable" | "provider_error"; message: string };

export type AvailabilityArgs = { service?: string; now: Date };
export type BookArgs = { service?: string; startUtc: Date; now: Date; customerName?: string; customerPhone?: string; callId?: string };

export interface SchedulingProvider {
  readonly id: string;
  getAvailability(shop: ShopWithOwner, args: AvailabilityArgs): Promise<AvailabilityResult>;
  createBooking(shop: ShopWithOwner, args: BookArgs): Promise<BookResult>;
}

// --- Native provider: Switchboard owns the calendar (our DB is the source) ----
export const nativeProvider: SchedulingProvider = {
  id: "native",

  async getAvailability(shop, { service, now }) {
    const config = await getLiveConfig(shop.id);
    if (!config) return { ok: false, reason: "not_configured", message: "No bookable services are set up yet." };
    const busy = await getBusyIntervals(shop.id, now);
    const slots = generateOpenSlots({
      hours: config.hours,
      timezone: shop.timezone,
      busy,
      now,
      durationMin: serviceDuration(config, service),
      capacity: config.capacity,
      bufferMin: config.buffer_min,
    });
    return { ok: true, slots };
  },

  async createBooking(shop, args) {
    const config = await getLiveConfig(shop.id);
    if (!config) return { ok: false, reason: "not_configured", message: "Booking isn't set up yet — the team will follow up." };
    const outcome: BookingOutcome = await createConfirmedBooking({
      shopId: shop.id,
      config,
      timezone: shop.timezone,
      startUtc: args.startUtc,
      now: args.now,
      service: args.service,
      customerName: args.customerName,
      customerPhone: args.customerPhone,
      callId: args.callId,
    });
    if (!outcome.ok) return { ok: false, reason: "unavailable", message: "That time isn't open — would another time work?" };
    return { ok: true, booking: outcome.booking };
  },
};

const PROVIDERS: Record<string, SchedulingProvider> = {
  [nativeProvider.id]: nativeProvider,
};

/**
 * Resolve the scheduling provider backing a shop. Defaults to native — the only
 * provider that needs no external connection — so an unset/unknown value is
 * always safe. External providers (e.g. Google Calendar) register here and are
 * selected via `shop.schedulingProvider`.
 */
export function resolveProvider(shop: ShopWithOwner): SchedulingProvider {
  const key = shop.schedulingProvider ?? "native";
  return PROVIDERS[key] ?? nativeProvider;
}
