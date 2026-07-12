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
