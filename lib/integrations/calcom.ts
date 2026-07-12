import "server-only";
import type { ShopConfig } from "../schemas";

// Cal.com integration — one event type per bookable service, slug-prefixed with
// the shop id (sb-{shopId}-...). Real API when CALCOM_API_KEY is set, else a
// deterministic mock so provisioning completes in dev.

const BASE = "https://api.cal.com/v2";

function hasKey() {
  return !!process.env.CALCOM_API_KEY;
}

function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
}

async function api<T>(path: string, method: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${process.env.CALCOM_API_KEY}`,
      "Content-Type": "application/json",
      "cal-api-version": "2024-06-14",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`Cal.com ${method} ${path} failed (${res.status}): ${await res.text().catch(() => "")}`);
  return (await res.json()) as T;
}

/**
 * Create/ensure an event type per bookable service. Returns { service: id }.
 * Idempotent at the handler level (the map is stored on the shop and reused).
 */
export async function createEventTypes(
  shopId: string,
  config: ShopConfig,
): Promise<Record<string, string>> {
  const bookable = config.services.filter((s) => s.bookable && s.service.trim());
  const map: Record<string, string> = {};

  if (!hasKey()) {
    // Mock: deterministic ids so retries never double-create.
    bookable.forEach((s, i) => (map[s.service] = `sb-${shopId}-${slugify(s.service)}-${i}`));
    return map;
  }

  for (const s of bookable) {
    const slug = `sb-${shopId}-${slugify(s.service)}`;
    const created = await api<{ data: { id: number } }>("/event-types", "POST", {
      title: `${config.business_name} — ${s.service}`,
      slug,
      lengthInMinutes: 60,
      description: `Booking for ${s.service}`,
    });
    map[s.service] = String(created.data.id);
  }
  return map;
}

/** Update availability windows post-live (hours changes sync here in Phase 3). */
export async function updateAvailability(_shopId: string, _config: ShopConfig): Promise<void> {
  if (!hasKey()) return;
  // Availability schedules are attached to the user; a full implementation maps
  // config.hours → a Cal.com schedule. Left as a Phase-3 wiring point.
}

// --- Call-time booking (used by the native agent tool routes) ---------------
// NOTE: Cal.com v2 wants a DIFFERENT cal-api-version per endpoint — slots want
// 2024-09-04, bookings want 2024-08-13 (event-types use 2024-06-14 above). Do
// NOT route these through the shared api() helper, which pins 2024-06-14.

/** Open appointment slots for an event type over the next `days`. */
export async function getSlots(eventTypeId: string, days = 7): Promise<unknown> {
  if (!hasKey()) {
    // Deterministic mock so dev/test flows return something sensible.
    const d = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const iso = d.toISOString().slice(0, 10);
    return { status: "success", data: { [iso]: [{ start: `${iso}T09:00:00.000Z` }, { start: `${iso}T13:00:00.000Z` }] }, mock: true };
  }
  const start = new Date().toISOString().slice(0, 10);
  const end = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const res = await fetch(`${BASE}/slots?eventTypeId=${encodeURIComponent(eventTypeId)}&start=${start}&end=${end}`, {
    headers: { Authorization: `Bearer ${process.env.CALCOM_API_KEY}`, "cal-api-version": "2024-09-04" },
  });
  if (!res.ok) throw new Error(`Cal.com slots failed (${res.status}): ${await res.text().catch(() => "")}`);
  return res.json();
}

/** Book an appointment. Callers have no email, so we synthesize a stable one. */
export async function createBooking(args: {
  eventTypeId: string;
  start: string;
  name: string;
  phone: string;
  timezone: string | null;
}): Promise<unknown> {
  if (!hasKey()) return { status: "success", data: { id: `mock-booking-${Date.now().toString(36)}`, start: args.start }, mock: true };
  const email = `caller+${(args.phone || "").replace(/\D/g, "") || "unknown"}@switchboard.app`;
  const res = await fetch(`${BASE}/bookings`, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.CALCOM_API_KEY}`, "Content-Type": "application/json", "cal-api-version": "2024-08-13" },
    body: JSON.stringify({
      eventTypeId: Number(args.eventTypeId),
      start: args.start,
      attendee: { name: args.name || "Phone caller", email, phoneNumber: args.phone || undefined, timeZone: args.timezone || "America/Chicago" },
      metadata: { source: "switchboard" },
    }),
  });
  if (!res.ok) throw new Error(`Cal.com booking failed (${res.status}): ${await res.text().catch(() => "")}`);
  return res.json();
}
