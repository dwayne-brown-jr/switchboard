"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import { getCurrentShop } from "@/lib/shop";
import { setBookingOutcome, type BookingOutcomeStatus } from "@/lib/booking";
import { refreshRollupsSafe } from "@/lib/customer";

// Owner actions on customer records.
//
// Every one of these re-resolves the shop from the SESSION and then scopes the
// write to it. The customer id in the argument list is never trusted on its own
// — it arrives from the browser and could be anything. `ownedCustomer` is the
// single choke point that turns an untrusted id into a row this owner may
// actually touch.

type Result = { ok: true } | { ok: false; error: string };

async function shopId(): Promise<string> {
  await requireUser();
  const shop = await getCurrentShop();
  if (!shop) throw new Error("No shop found.");
  return shop.id;
}

/** Resolve a customer id to a row this owner's shop actually owns, or null. */
async function ownedCustomer(customerId: string) {
  const sid = await shopId();
  const c = await prisma.customer.findFirst({ where: { id: customerId, shopId: sid }, select: { id: true, shopId: true, stage: true } });
  return c;
}

function revalidate(customerId: string) {
  revalidatePath("/app/customers");
  revalidatePath(`/app/customers/${customerId}`);
}

/** Record a system/owner event so the timeline shows more than calls. */
async function logEvent(shopId: string, customerId: string, kind: string, body: string | null, actorId?: string) {
  await prisma.customerEvent.create({ data: { shopId, customerId, kind, body, actorId: actorId ?? null } });
}

export async function setStage(customerId: string, stage: string): Promise<Result> {
  const allowed = ["lead", "active", "dormant", "lost"];
  if (!allowed.includes(stage)) return { ok: false, error: "Unknown stage." };
  const c = await ownedCustomer(customerId);
  if (!c) return { ok: false, error: "Customer not found." };
  if (c.stage === stage) return { ok: true };

  const user = await requireUser();
  await prisma.customer.update({ where: { id: c.id }, data: { stage } });
  await logEvent(c.shopId, c.id, "stage_change", `${c.stage} → ${stage}`, user.id);
  revalidate(customerId);
  return { ok: true };
}

export async function saveNote(customerId: string, notes: string): Promise<Result> {
  const c = await ownedCustomer(customerId);
  if (!c) return { ok: false, error: "Customer not found." };
  const trimmed = notes.trim().slice(0, 5_000);
  await prisma.customer.update({ where: { id: c.id }, data: { notes: trimmed || null } });
  revalidate(customerId);
  return { ok: true };
}

/** Free-text note appended to the timeline (distinct from the pinned `notes` field). */
export async function addTimelineNote(customerId: string, body: string): Promise<Result> {
  const c = await ownedCustomer(customerId);
  if (!c) return { ok: false, error: "Customer not found." };
  const trimmed = body.trim().slice(0, 2_000);
  if (!trimmed) return { ok: false, error: "Note is empty." };
  const user = await requireUser();
  await logEvent(c.shopId, c.id, "note", trimmed, user.id);
  revalidate(customerId);
  return { ok: true };
}

export async function addTag(customerId: string, label: string): Promise<Result> {
  const c = await ownedCustomer(customerId);
  if (!c) return { ok: false, error: "Customer not found." };
  const clean = label.trim().toLowerCase().slice(0, 40);
  if (!clean) return { ok: false, error: "Tag is empty." };
  // Unique on (customerId, label) — a repeat add is a no-op, not an error.
  await prisma.customerTag.upsert({
    where: { customerId_label: { customerId: c.id, label: clean } },
    create: { customerId: c.id, label: clean },
    update: {},
  });
  revalidate(customerId);
  return { ok: true };
}

export async function removeTag(customerId: string, label: string): Promise<Result> {
  const c = await ownedCustomer(customerId);
  if (!c) return { ok: false, error: "Customer not found." };
  await prisma.customerTag.deleteMany({ where: { customerId: c.id, label } });
  revalidate(customerId);
  return { ok: true };
}

export async function addAsset(customerId: string, kind: string, label: string): Promise<Result> {
  const c = await ownedCustomer(customerId);
  if (!c) return { ok: false, error: "Customer not found." };
  const allowed = ["vehicle", "property", "equipment"];
  if (!allowed.includes(kind)) return { ok: false, error: "Unknown type." };
  const clean = label.trim().slice(0, 120);
  if (!clean) return { ok: false, error: "Give it a name." };
  await prisma.customerAsset.create({ data: { customerId: c.id, kind, label: clean } });
  revalidate(customerId);
  return { ok: true };
}

export async function removeAsset(customerId: string, assetId: string): Promise<Result> {
  const c = await ownedCustomer(customerId);
  if (!c) return { ok: false, error: "Customer not found." };
  // Scoped to the customer we just proved ownership of, so a stray assetId
  // from another shop deletes nothing.
  await prisma.customerAsset.deleteMany({ where: { id: assetId, customerId: c.id } });
  revalidate(customerId);
  return { ok: true };
}

/**
 * Close out a booking — the action that finally makes lifetime value mean money
 * instead of the AI's pre-job estimate.
 *
 * `dollars` is what the owner types; it's converted to cents here, at the edge,
 * so nothing downstream has to wonder which unit it's holding.
 */
export async function closeOutBooking(
  customerId: string,
  bookingId: string,
  status: BookingOutcomeStatus,
  dollars?: number | null,
): Promise<Result> {
  const c = await ownedCustomer(customerId);
  if (!c) return { ok: false, error: "Customer not found." };

  const valueCents =
    status === "completed" && dollars != null && Number.isFinite(dollars) && dollars >= 0
      ? Math.round(dollars * 100)
      : null;

  const res = await setBookingOutcome({ shopId: c.shopId, bookingId, status, valueCents });
  if (!res.ok) return { ok: false, error: "That appointment no longer exists." };

  await logEvent(
    c.shopId,
    c.id,
    "booking_closed",
    status === "completed"
      ? `Job completed${valueCents != null ? ` — ${(valueCents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" })}` : ""}`
      : status === "no_show"
        ? "Marked no-show"
        : status === "canceled"
          ? "Appointment cancelled"
          : "Reopened",
  );

  await refreshRollupsSafe(c.id);
  revalidate(customerId);
  revalidatePath("/app");
  return { ok: true };
}
