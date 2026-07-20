import "server-only";
import { prisma } from "./db";
import { reportError } from "./observability";
import { notifyAdmins } from "./notify";
import { DEMO_SHOP_ID } from "./demo-login";
import { SILENT_DAYS, classifyCallPath, type CallPathStatus } from "./call-path";
import {
  ERROR_WINDOW_MINUTES,
  classifyErrorFeed,
  errorAlertThreshold,
  type ErrorFeedStatus,
} from "./error-feed";

// Proactive voice-path health check. A live shop whose Twilio number silently
// stops routing (SIP trunk issue, unbound number, carrier problem) would take
// calls to a dead line with nobody noticing. We can't ping the trunk directly,
// but we CAN watch for the tell-tale symptom: a shop that WAS receiving calls
// and suddenly goes quiet. Runs from a daily cron (/api/jobs/health-check).

const REALERT_HOURS = 24;

/** Read-only view of the voice path for external monitoring (/api/health/calls).
 *
 *  Writes nothing and alerts nobody — detectSilentShops() below owns alerting.
 *  The point of having both is an alert path that does not depend on our own
 *  email: if Resend is down or misconfigured, notifyAdmins() never arrives and
 *  nothing tells us. Checkly polling this endpoint is out-of-band.
 *
 *  Reports counts only — never shop names or ids. This is a public endpoint and
 *  shop counts would disclose business scale.
 *
 *  `misconfigured` is the faster signal of the two: a live shop with no number
 *  or no live agent version cannot answer a call right now, and unlike silence
 *  that needs no multi-day window to be certain about. */
export async function callPathStatus(): Promise<CallPathStatus> {
  const live = await prisma.shop.findMany({
    where: { status: "live", id: { not: DEMO_SHOP_ID } },
    select: { id: true, agentNumber: true, liveVersionId: true },
  });

  const answerable = live.filter((s) => s.agentNumber && s.liveVersionId).map((s) => s.id);
  const lastCalls = answerable.length
    ? await prisma.callRecord.groupBy({
        by: ["shopId"],
        where: { shopId: { in: answerable } },
        _max: { timestamp: true },
      })
    : [];

  const lastCallByShop = new Map<string, Date>();
  for (const row of lastCalls) {
    if (row._max.timestamp) lastCallByShop.set(row.shopId, row._max.timestamp);
  }

  return classifyCallPath(live, lastCallByShop, Date.now());
}

/** Read-only view of the failure feed for external monitoring
 *  (/api/health/errors).
 *
 *  Counts only — never routes or messages. This is a public endpoint and error
 *  messages routinely carry shop names, phone numbers and vendor ids. The count
 *  is enough to say "go look"; the detail stays behind the admin surface. */
export async function errorFeedStatus(): Promise<ErrorFeedStatus> {
  const since = new Date(Date.now() - ERROR_WINDOW_MINUTES * 60_000);
  const rows = await prisma.failureEvent.groupBy({
    by: ["level"],
    where: { createdAt: { gte: since } },
    _count: true,
  });

  const count = (level: string) => rows.find((r) => r.level === level)?._count ?? 0;
  return classifyErrorFeed({ errors: count("error"), warns: count("warn") }, errorAlertThreshold());
}

/** Flag live shops that had call history and then went silent for SILENT_DAYS —
 *  a likely broken voice path. Deliberately skips shops with NO call history
 *  (can't distinguish "broken" from "low-traffic / brand new"). Deduped via the
 *  failure feed so a persistently-silent shop pages at most once a day. */
export async function detectSilentShops(): Promise<{ scanned: number; silent: number }> {
  const cutoff = Date.now() - SILENT_DAYS * 86_400_000;
  const shops = await prisma.shop.findMany({
    // The reviewer demo shop is "live" with mock calls frozen at seed time, so it
    // reads as a silent shop a few days after every seed. Excluded everywhere we
    // reason about real call volume.
    where: { status: "live", liveVersionId: { not: null }, id: { not: DEMO_SHOP_ID } },
    select: { id: true, businessName: true },
  });

  let silent = 0;
  for (const shop of shops) {
    const lastCall = await prisma.callRecord.findFirst({
      where: { shopId: shop.id },
      orderBy: { timestamp: "desc" },
      select: { timestamp: true },
    });
    // No history → can't tell broken from low-traffic. Had a call recently → fine.
    if (!lastCall || lastCall.timestamp.getTime() > cutoff) continue;

    // Dedupe: only page once per REALERT_HOURS per shop.
    const since = new Date(Date.now() - REALERT_HOURS * 3_600_000);
    const recent = await prisma.failureEvent.findFirst({
      where: { route: "health:silent", shopId: shop.id, createdAt: { gte: since } },
    });
    if (recent) continue;

    const days = Math.round((Date.now() - lastCall.timestamp.getTime()) / 86_400_000);
    const msg = `No calls in ${days}d — ${shop.businessName} (${shop.id}). Possible broken voice path.`;
    await reportError(new Error(msg), { source: "job", route: "health:silent", shopId: shop.id, level: "warn" });
    await notifyAdmins("Shop went silent", msg).catch(() => {});
    silent++;
  }
  return { scanned: shops.length, silent };
}
