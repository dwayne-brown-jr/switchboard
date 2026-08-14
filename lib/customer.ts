import "server-only";
import type { Prisma, Customer } from "@prisma/client";
import { prisma } from "./db";
import { toE164 } from "./phone";

// Customer layer — identity resolution and rollups. See docs/CRM-PLAN.md.
//
// The rest of the system is event-shaped: a call comes in, a row is written,
// and the person on the other end is just a phone-number string. This module is
// the spine that turns those strings into a Customer, so that two calls six
// months apart are one relationship instead of two unrelated rows.
//
// Two properties this module has to guarantee, because the call path depends on
// them:
//
//   1. It never throws into the call path. A CRM failure must never cost us a
//      CallRecord — callers use `resolveCustomerSafe`, which swallows and logs.
//   2. Resolution converges regardless of write order. `create_booking` fires
//      MID-call; the `call-events` webhook lands AFTER it. Either can be the
//      first thing that sees a given phone number. Both go through an upsert on
//      CustomerPhone's @@unique([shopId, phoneE164]), so the database — not our
//      read-then-write logic — decides who wins the race, and both paths end up
//      pointing at the same Customer row.

// --- Money -----------------------------------------------------------------
// Every money field added by the customer layer is in CENTS (matching Stripe).
// The pre-existing CallRecord.estJobValue is whole DOLLARS, from the voice
// provider's post-call analysis. That boundary is crossed in exactly one place,
// here, so the mixed units can't leak into the rest of the layer.

/** CallRecord.estJobValue (whole dollars) → cents. */
export function estJobValueToCents(dollars: number | null | undefined): number {
  if (!dollars || !Number.isFinite(dollars) || dollars <= 0) return 0;
  return Math.round(dollars * 100);
}

// --- Identity resolution ---------------------------------------------------

export interface ResolveHints {
  /** Name the agent captured on the call, if any. */
  name?: string | null;
  /** When this contact happened. Defaults to now. */
  at?: Date;
}

/**
 * Resolve a raw caller phone number to a Customer for this shop, creating one
 * on first contact.
 *
 * Returns `null` — deliberately, not an error — when the number can't be
 * confidently normalized to E.164. Blocked/withheld caller ID and malformed
 * numbers are real, common calls; forcing them onto a synthetic customer would
 * quietly corrupt every rollup and merge the shop's anonymous callers into one
 * fictional person. They stay unlinked and surface in the UI as "Unknown
 * caller".
 */
export async function resolveCustomer(
  shopId: string,
  rawPhone: string | null | undefined,
  hints: ResolveHints = {},
): Promise<Customer | null> {
  const phoneE164 = toE164(rawPhone);
  if (!phoneE164) return null;

  const at = hints.at ?? new Date();
  const name = hints.name?.trim() || null;

  // Upsert on the tenant-scoped unique index. Doing this as an upsert rather
  // than findFirst-then-create is what makes concurrent ingest safe: if the
  // mid-call booking and the post-call webhook arrive simultaneously, one
  // insert wins and the other resolves to the same row instead of creating a
  // duplicate customer.
  const link = await prisma.customerPhone.upsert({
    where: { shopId_phoneE164: { shopId, phoneE164 } },
    create: {
      shopId,
      phoneE164,
      isPrimary: true,
      customer: {
        create: {
          shopId,
          displayName: name,
          firstName: splitName(name).first,
          lastName: splitName(name).last,
          source: "agent",
          firstSeenAt: at,
          lastContactAt: at,
        },
      },
    },
    update: {},
    include: { customer: true },
  });

  const customer = link.customer;

  // Fill in a name we didn't have before. Never overwrite one we do — an owner
  // may have corrected it by hand, and the agent's transcription of a name over
  // a phone line is the less trustworthy source.
  const patch: Prisma.CustomerUpdateInput = {};
  if (name && !customer.displayName) {
    patch.displayName = name;
    const { first, last } = splitName(name);
    if (first && !customer.firstName) patch.firstName = first;
    if (last && !customer.lastName) patch.lastName = last;
  }
  if (at > customer.lastContactAt) patch.lastContactAt = at;
  if (at < customer.firstSeenAt) patch.firstSeenAt = at;

  if (Object.keys(patch).length === 0) return customer;
  return prisma.customer.update({ where: { id: customer.id }, data: patch });
}

/**
 * `resolveCustomer` wrapped so it can never break the thing that called it.
 * Every call-path caller uses this: losing the CRM link on a call is a
 * recoverable annoyance (the nightly reconciliation job and the backfill script
 * both repair it), whereas losing the CallRecord is not.
 */
export async function resolveCustomerSafe(
  shopId: string,
  rawPhone: string | null | undefined,
  hints: ResolveHints = {},
): Promise<Customer | null> {
  try {
    return await resolveCustomer(shopId, rawPhone, hints);
  } catch (e) {
    console.error("customer resolution failed", e);
    return null;
  }
}

/** "Dwayne Leon" → { first: "Dwayne", last: "Leon" }. Single-token names are
 *  all first name; we don't guess at surnames. */
function splitName(name: string | null): { first: string | null; last: string | null } {
  if (!name) return { first: null, last: null };
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0) return { first: null, last: null };
  if (parts.length === 1) return { first: parts[0], last: null };
  return { first: parts[0], last: parts.slice(1).join(" ") };
}

// --- Rollups ---------------------------------------------------------------

export interface Rollups {
  callCount: number;
  bookingCount: number;
  noShowCount: number;
  lifetimeValue: number; // cents
  firstSeenAt: Date;
  lastContactAt: Date;
  stage: string;
}

/**
 * Recompute a customer's denormalized counters from source rows.
 *
 * Lifetime value prefers the ACTUAL value entered on a completed booking
 * (`Booking.valueCents`) and falls back to the voice provider's ESTIMATE on
 * booked calls (`CallRecord.estJobValue`, dollars) for shops that never enter
 * real job costs — which is most of them, at first. Without that fallback the
 * headline number on the customer page would read $0 for every shop that hasn't
 * adopted job costing, which is worse than an approximation.
 */
export async function computeRollups(customerId: string): Promise<Rollups | null> {
  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    select: { id: true, createdAt: true, stage: true },
  });
  if (!customer) return null;

  const [calls, bookings] = await Promise.all([
    prisma.callRecord.findMany({
      where: { customerId },
      select: { timestamp: true, booked: true, estJobValue: true },
    }),
    prisma.booking.findMany({
      where: { customerId },
      select: { status: true, valueCents: true, startUtc: true, createdAt: true, callId: true },
    }),
  ]);

  const actualCents = bookings
    .filter((b) => b.status === "completed")
    .reduce((s, b) => s + (b.valueCents ?? 0), 0);

  const estimateCents = calls
    .filter((c) => c.booked)
    .reduce((s, c) => s + estJobValueToCents(c.estJobValue), 0);

  // Actuals and estimates describe the SAME jobs, so they're never summed —
  // that would double-count. Once a shop enters any real job value, actuals
  // become authoritative and the estimates are dropped entirely.
  const lifetimeValue = actualCents > 0 ? actualCents : estimateCents;

  const contactTimes = [
    ...calls.map((c) => c.timestamp),
    ...bookings.map((b) => b.createdAt),
  ].filter(Boolean);

  const firstSeenAt = contactTimes.length ? new Date(Math.min(...contactTimes.map((d) => d.getTime()))) : customer.createdAt;
  const lastContactAt = contactTimes.length ? new Date(Math.max(...contactTimes.map((d) => d.getTime()))) : customer.createdAt;

  const bookingCount = bookings.filter((b) => b.status === "confirmed" || b.status === "completed").length;
  const noShowCount = bookings.filter((b) => b.status === "no_show").length;

  return {
    callCount: calls.length,
    bookingCount,
    noShowCount,
    lifetimeValue,
    firstSeenAt,
    lastContactAt,
    stage: nextStage(customer.stage, bookingCount, lastContactAt),
  };
}

/** Recompute and persist. Safe to call repeatedly; converges on the same state. */
export async function refreshRollups(customerId: string): Promise<void> {
  const r = await computeRollups(customerId);
  if (!r) return;
  await prisma.customer.update({ where: { id: customerId }, data: r });
}

/** Same, wrapped for call-path use. */
export async function refreshRollupsSafe(customerId: string | null | undefined): Promise<void> {
  if (!customerId) return;
  try {
    await refreshRollups(customerId);
  } catch (e) {
    console.error("customer rollup refresh failed", e);
  }
}

/**
 * Reconcile every customer's rollups against their source rows.
 *
 * The live paths refresh rollups inline, but they're best-effort by design (a
 * CRM write must never fail a call), so drift is expected rather than
 * exceptional: a resolution that threw, a booking marked completed straight in
 * the database, a customer crossing the dormancy threshold purely by the
 * passage of time — that last one can only ever be caught by a sweep, because
 * nothing writes on the day a customer goes quiet.
 *
 * Batched to keep memory flat if a shop ever has a large book.
 */
export async function reconcileRollups(batchSize = 200): Promise<{ scanned: number; updated: number }> {
  let cursor: string | undefined;
  let scanned = 0;
  let updated = 0;

  for (;;) {
    const batch = await prisma.customer.findMany({
      take: batchSize,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: { id: "asc" },
      select: {
        id: true,
        callCount: true,
        bookingCount: true,
        noShowCount: true,
        lifetimeValue: true,
        stage: true,
      },
    });
    if (batch.length === 0) break;
    cursor = batch[batch.length - 1].id;

    for (const c of batch) {
      scanned++;
      const r = await computeRollups(c.id);
      if (!r) continue;
      // Only write on an actual difference — an untouched customer shouldn't
      // get its updatedAt bumped by a nightly sweep.
      const changed =
        r.callCount !== c.callCount ||
        r.bookingCount !== c.bookingCount ||
        r.noShowCount !== c.noShowCount ||
        r.lifetimeValue !== c.lifetimeValue ||
        r.stage !== c.stage;
      if (!changed) continue;
      await prisma.customer.update({ where: { id: c.id }, data: r });
      updated++;
    }

    if (batch.length < batchSize) break;
  }

  return { scanned, updated };
}

/** Days without contact before an active customer is considered dormant. */
export const DORMANT_DAYS = 180;

/**
 * Stage transitions. Deliberately one-way out of `lost`: an owner who marks a
 * customer lost shouldn't have the system silently un-mark them.
 */
export function nextStage(current: string, bookingCount: number, lastContactAt: Date, now: Date = new Date()): string {
  if (current === "lost") return "lost";
  const daysSince = (now.getTime() - lastContactAt.getTime()) / 86_400_000;
  if (daysSince > DORMANT_DAYS) return "dormant";
  if (bookingCount > 0) return "active";
  return "lead";
}
