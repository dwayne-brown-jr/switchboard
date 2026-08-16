import "server-only";
import { prisma } from "./db";
import { toE164 } from "./phone";

// What the voice agent is allowed to know about the person on the line.
//
// Split out of the route so it can be unit-tested without an HTTP layer, and so
// the shape of what we disclose lives in one reviewable place.
//
// ---------------------------------------------------------------------------
// WHAT THIS DELIBERATELY DOES NOT RETURN
// ---------------------------------------------------------------------------
// Caller ID is a weak identifier. A spouse, a coworker, or the next owner of a
// recycled number will all resolve to this record, and whatever we return gets
// spoken aloud to whoever is holding the phone. So the payload is limited to
// what a receptionist could safely say to a stranger who walked in claiming to
// be a regular:
//
//   * first name only — never the surname, email, or address
//   * the last service and roughly when — not a full history
//   * asset labels ("2018 Silverado") — these are how the shop refers to the
//     job, and are visible on the vehicle anyway
//
// Explicitly withheld: lifetime value, notes, tags, phone numbers, no-show
// counts, anything about other visits. If a future caller-facing feature needs
// more, that is a decision to make on purpose, not by widening this object.

export interface CallerContext {
  known: boolean;
  /** First name only — safe to greet with. */
  first_name?: string;
  /** True once they've actually had work done, vs. having merely called. */
  returning?: boolean;
  calls?: number;
  last_service?: string;
  /** Human phrase, not a date — the agent should say "back in March". */
  last_seen?: string;
  /** e.g. ["2018 Silverado"] */
  assets?: string[];
  /** An appointment already on the books, so the agent doesn't double-book. */
  upcoming?: { service: string | null; when: string };
}

/** How long since contact before we stop bringing it up unprompted. */
const STALE_MONTHS = 24;

/**
 * Pull the caller's number out of a Retell custom-tool request body.
 *
 * Retell NESTS tool arguments under `args` — reading `body.phone` directly
 * yields undefined, which is how the first working call still answered
 * known:false: the agent invoked the tool with the right number and the route
 * threw it away. `app/api/agent/create-booking` already handled this shape;
 * this is the same idiom, extracted so it can be tested.
 *
 * `call.from_number` is preferred over the argument because it comes from the
 * telephony layer rather than the model. The model can omit the argument,
 * truncate it, or mis-transcribe it — and recognition shouldn't depend on it
 * remembering to pass anything it was told.
 */
export function callerPhoneFromToolBody(body: unknown): string | null {
  const b = (body ?? {}) as { args?: Record<string, unknown>; call?: { from_number?: unknown }; [k: string]: unknown };
  const a = (b.args ?? b ?? {}) as Record<string, unknown>;
  const candidates = [b.call?.from_number, a.phone, a.from_number];
  for (const c of candidates) {
    if (typeof c === "string" && c.trim()) return c;
  }
  return null;
}

/**
 * Look up the caller for one shop. Returns `{ known: false }` for anything we
 * can't confidently answer — an unnormalizable number, a caller we've never
 * heard from, or a record too stale to be worth mentioning.
 *
 * Shop-scoped through the CustomerPhone unique index, so the same number
 * calling two different shops resolves to two independent records and neither
 * can see the other.
 */
export async function lookupCallerContext(shopId: string, rawPhone: string | null | undefined): Promise<CallerContext> {
  const phoneE164 = toE164(rawPhone);
  if (!phoneE164) return { known: false };

  const link = await prisma.customerPhone.findUnique({
    where: { shopId_phoneE164: { shopId, phoneE164 } },
    include: {
      customer: {
        include: {
          assets: { orderBy: { createdAt: "desc" }, take: 3 },
          bookings: { orderBy: { startUtc: "desc" }, take: 20 },
        },
      },
    },
  });

  const c = link?.customer;
  if (!c) return { known: false };

  // A customer the owner wrote off, or who asked not to be contacted, should
  // not be greeted by name as though nothing happened.
  if (c.stage === "lost" || c.doNotContact) return { known: false };

  const now = Date.now();
  const monthsSince = (now - c.lastContactAt.getTime()) / (1000 * 60 * 60 * 24 * 30.44);
  if (monthsSince > STALE_MONTHS) return { known: false };

  // Their most recent finished job — the thing worth referencing.
  const past = c.bookings.filter((b) => b.status === "completed" || (b.status === "confirmed" && b.startUtc.getTime() < now));
  const lastJob = past[0] ?? null;

  // Anything still ahead of them, so the agent doesn't offer a second slot for
  // an appointment they already hold.
  const next = c.bookings
    .filter((b) => b.status === "confirmed" && b.startUtc.getTime() >= now)
    .sort((a, b) => a.startUtc.getTime() - b.startUtc.getTime())[0];

  const ctx: CallerContext = {
    known: true,
    returning: c.bookingCount > 0,
    calls: c.callCount,
  };

  if (c.firstName) ctx.first_name = c.firstName;
  if (lastJob?.service) ctx.last_service = lastJob.service;
  if (lastJob) ctx.last_seen = relativeMonths(lastJob.startUtc, now);
  if (c.assets.length) ctx.assets = c.assets.map((a) => a.label);
  if (next) ctx.upcoming = { service: next.service, when: next.startUtc.toISOString() };

  return ctx;
}

/** A phrase a person would say out loud, not a timestamp. */
export function relativeMonths(then: Date, now: number = Date.now()): string {
  const days = Math.floor((now - then.getTime()) / 86_400_000);
  if (days <= 1) return "yesterday";
  if (days < 14) return `${days} days ago`;
  if (days < 60) return `about ${Math.round(days / 7)} weeks ago`;
  const months = Math.round(days / 30.44);
  if (months < 24) return `about ${months} months ago`;
  return `over ${Math.floor(months / 12)} years ago`;
}
