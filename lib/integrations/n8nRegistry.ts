import "server-only";
import type { Shop } from "@prisma/client";
import type { ShopConfig } from "../schemas";

// Registers/refreshes a shop in the store the self-hosted n8n flows read
// (client_id, numbers, value map, ingest URL + secret). Real POST when
// N8N_REGISTRY_URL is set; no-op otherwise so dev provisioning completes.

export interface ShopRegistration {
  client_id: string;
  business_name: string;
  vertical: string;
  timezone: string | null;
  business_number: string | null;
  agent_number: string | null;
  owner_mobile: string | null;
  service_value_map: Record<string, number>;
  cal_event_type_map: Record<string, string>;
  a2p_status: string | null;
  avg_ticket: number;
  ingest_url: string;
  ingest_secret: string;
}

export function buildRegistration(shop: Shop, config: ShopConfig, ingestSecret: string): ShopRegistration {
  const appUrl = process.env.APP_URL ?? "http://localhost:3000";
  return {
    client_id: shop.id,
    business_name: shop.businessName,
    vertical: shop.vertical,
    timezone: shop.timezone,
    business_number: shop.businessNumber,
    agent_number: shop.agentNumber,
    owner_mobile: shop.ownerMobile,
    service_value_map: config.service_value_map,
    cal_event_type_map: (shop.calEventTypeMap as Record<string, string> | null) ?? {},
    a2p_status: shop.a2pStatus,
    avg_ticket: config.avg_ticket,
    ingest_url: `${appUrl}/api/ingest/call`,
    ingest_secret: ingestSecret,
  };
}

export async function registerShop(payload: ShopRegistration): Promise<{ registered: boolean }> {
  const url = process.env.N8N_REGISTRY_URL;
  const token = process.env.N8N_REGISTRY_TOKEN;
  if (!url) return { registered: false }; // dev: n8n not wired yet
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`n8n registry failed (${res.status}): ${await res.text().catch(() => "")}`);
  return { registered: true };
}

/** Broker tool URLs the agent calls (check availability, book, notify owner). */
export function brokerFunctions(shopId: string) {
  // `||` (not `??`) so an empty-string env var falls back to the mock broker.
  const base = process.env.N8N_BROKER_URL || `${process.env.APP_URL || "http://localhost:3000"}/api/mock-broker`;
  return [
    { name: "check_availability" as const, url: `${base}/check-availability?client_id=${shopId}`, description: "Check open appointment times for a service." },
    { name: "create_booking" as const, url: `${base}/create-booking?client_id=${shopId}`, description: "Book an appointment on the calendar." },
    { name: "notify_owner" as const, url: `${base}/notify-owner?client_id=${shopId}`, description: "Text the owner about an emergency or important message." },
  ];
}
