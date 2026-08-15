import "server-only";
import { prisma } from "./db";

// Read layer for the customer CRM (Phase B). Kept separate from customer.ts,
// which owns identity resolution on the WRITE path — these are the queries the
// owner-facing pages run, and mixing them would make the hot call path drag
// along code it never executes.
//
// Every function here takes a shopId and filters on it. That is the tenant
// boundary: a customer id alone is never enough to read a row, so guessing an
// id from another shop returns nothing rather than someone else's data.

export type Stage = "lead" | "active" | "dormant" | "lost";
export const STAGES: Stage[] = ["lead", "active", "dormant", "lost"];

export type SortKey = "recent" | "value" | "calls" | "name";

export interface CustomerListRow {
  id: string;
  displayName: string | null;
  phone: string | null;
  stage: string;
  callCount: number;
  bookingCount: number;
  lifetimeValue: number; // cents
  lastContactAt: Date;
  tags: string[];
}

export interface ListOptions {
  search?: string;
  stage?: Stage | "all";
  sort?: SortKey;
  take?: number;
  skip?: number;
}

/**
 * The customer list. Search matches name OR phone — an owner looking someone up
 * mid-conversation is far more likely to have the number than the spelling, and
 * digits typed as "760-555-0134" have to match a stored "+17605550134", so the
 * phone side of the search strips to digits before comparing.
 */
export async function listCustomers(
  shopId: string,
  opts: ListOptions = {},
): Promise<{ rows: CustomerListRow[]; total: number }> {
  const { search, stage = "all", sort = "recent", take = 50, skip = 0 } = opts;

  const term = search?.trim();
  const digits = term?.replace(/\D/g, "") ?? "";

  const where = {
    shopId,
    ...(stage !== "all" ? { stage } : {}),
    ...(term
      ? {
          OR: [
            { displayName: { contains: term } },
            { firstName: { contains: term } },
            { lastName: { contains: term } },
            { email: { contains: term } },
            // Only try a phone match once there are enough digits to be a real
            // query — one or two digits would match nearly every number.
            ...(digits.length >= 3 ? [{ phones: { some: { phoneE164: { contains: digits } } } }] : []),
          ],
        }
      : {}),
  };

  const orderBy =
    sort === "value"
      ? [{ lifetimeValue: "desc" as const }, { lastContactAt: "desc" as const }]
      : sort === "calls"
        ? [{ callCount: "desc" as const }, { lastContactAt: "desc" as const }]
        : sort === "name"
          ? [{ displayName: "asc" as const }]
          : [{ lastContactAt: "desc" as const }];

  const [rows, total] = await Promise.all([
    prisma.customer.findMany({
      where,
      orderBy,
      take,
      skip,
      include: {
        phones: { where: { isPrimary: true }, take: 1, select: { phoneE164: true } },
        tags: { select: { label: true }, orderBy: { label: "asc" } },
      },
    }),
    prisma.customer.count({ where }),
  ]);

  return {
    rows: rows.map((c) => ({
      id: c.id,
      displayName: c.displayName,
      phone: c.phones[0]?.phoneE164 ?? null,
      stage: c.stage,
      callCount: c.callCount,
      bookingCount: c.bookingCount,
      lifetimeValue: c.lifetimeValue,
      lastContactAt: c.lastContactAt,
      tags: c.tags.map((t) => t.label),
    })),
    total,
  };
}

/** Headline counts for the list page's filter chips. */
export async function customerStageCounts(shopId: string): Promise<Record<string, number>> {
  const rows = await prisma.customer.groupBy({
    by: ["stage"],
    where: { shopId },
    _count: { _all: true },
  });
  const out: Record<string, number> = { all: 0 };
  for (const r of rows) {
    out[r.stage] = r._count._all;
    out.all += r._count._all;
  }
  return out;
}

/**
 * Whether a customer's lifetime value is real money or the AI's pre-job guess.
 *
 * This distinction is not cosmetic. Until a booking is marked completed WITH a
 * value, `lifetimeValue` is the sum of `CallRecord.estJobValue` — a number the
 * voice model produced from a phone conversation before anyone looked at the
 * vehicle. Showing that as "Lifetime value" without qualification would be
 * presenting a guess as revenue, so the UI labels it.
 */
export type ValueBasis = "actual" | "estimated" | "none";

export async function lifetimeValueBasis(customerId: string): Promise<ValueBasis> {
  const actual = await prisma.booking.count({
    where: { customerId, status: "completed", valueCents: { not: null } },
  });
  if (actual > 0) return "actual";
  const est = await prisma.callRecord.count({ where: { customerId, booked: true, estJobValue: { gt: 0 } } });
  return est > 0 ? "estimated" : "none";
}

/** A customer plus everything the detail page needs. Null when not this shop's. */
export async function getCustomerDetail(shopId: string, customerId: string) {
  const customer = await prisma.customer.findFirst({
    where: { id: customerId, shopId }, // shopId here IS the tenant check
    include: {
      phones: { orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }] },
      assets: { orderBy: { createdAt: "desc" } },
      tags: { orderBy: { label: "asc" } },
    },
  });
  if (!customer) return null;
  const basis = await lifetimeValueBasis(customer.id);
  return { ...customer, valueBasis: basis };
}

// --- Timeline --------------------------------------------------------------

export type TimelineItem =
  | {
      kind: "call";
      id: string;
      at: Date;
      outcome: string | null;
      intent: string | null;
      service: string | null;
      booked: boolean;
      hotJob: boolean;
      durationSec: number;
      estJobValue: number; // dollars (legacy unit)
      summary: string | null;
      recordingUrl: string | null;
    }
  | {
      kind: "booking";
      id: string;
      at: Date;
      startUtc: Date;
      service: string | null;
      status: string;
      valueCents: number | null;
    }
  | { kind: "event"; id: string; at: Date; eventKind: string; body: string | null };

/**
 * The unified history for one customer, newest first.
 *
 * Deliberately a union of three queries rather than a materialized feed table.
 * Calls and bookings already live in their own tables; duplicating them into an
 * activity log would mean two writes per event and a permanent opportunity for
 * the two to disagree. At the volumes here — a busy shop does a few hundred
 * calls a month — merging in memory is free. Revisit past ~10k events.
 */
export async function getCustomerTimeline(shopId: string, customerId: string, take = 100): Promise<TimelineItem[]> {
  // Re-assert the tenant boundary: this is callable independently of
  // getCustomerDetail, so it must not trust that the caller already checked.
  const owned = await prisma.customer.findFirst({ where: { id: customerId, shopId }, select: { id: true } });
  if (!owned) return [];

  const [calls, bookings, events] = await Promise.all([
    prisma.callRecord.findMany({
      where: { customerId, shopId },
      orderBy: { timestamp: "desc" },
      take,
    }),
    prisma.booking.findMany({
      where: { customerId, shopId },
      orderBy: { startUtc: "desc" },
      take,
    }),
    prisma.customerEvent.findMany({
      where: { customerId, shopId },
      orderBy: { createdAt: "desc" },
      take,
    }),
  ]);

  const items: TimelineItem[] = [
    ...calls.map((c) => ({
      kind: "call" as const,
      id: c.id,
      at: c.timestamp,
      outcome: c.outcome,
      intent: c.intent,
      service: c.service,
      booked: c.booked,
      hotJob: c.hotJob,
      durationSec: c.durationSec,
      estJobValue: c.estJobValue,
      summary: c.summary,
      recordingUrl: c.transcriptUrl,
    })),
    ...bookings.map((b) => ({
      kind: "booking" as const,
      id: b.id,
      at: b.startUtc,
      startUtc: b.startUtc,
      service: b.service,
      status: b.status,
      valueCents: b.valueCents,
    })),
    ...events.map((e) => ({
      kind: "event" as const,
      id: e.id,
      at: e.createdAt,
      eventKind: e.kind,
      body: e.body,
    })),
  ];

  return items.sort((a, b) => b.at.getTime() - a.at.getTime()).slice(0, take);
}

/** Bookings still open for close-out (the "did this job happen?" queue). */
export async function getOpenBookings(shopId: string, customerId: string) {
  return prisma.booking.findMany({
    where: { shopId, customerId, status: "confirmed" },
    orderBy: { startUtc: "asc" },
  });
}

/** Money helper: cents → "$1,234.56", or "$1,234" when it's a whole dollar. */
export function formatCents(cents: number): string {
  const dollars = cents / 100;
  return dollars.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  });
}

/** "+17605550134" → "(760) 555-0134". Falls back to the raw string. */
export function formatPhone(e164: string | null): string {
  if (!e164) return "Unknown caller";
  const m = /^\+1(\d{3})(\d{3})(\d{4})$/.exec(e164);
  return m ? `(${m[1]}) ${m[2]}-${m[3]}` : e164;
}
