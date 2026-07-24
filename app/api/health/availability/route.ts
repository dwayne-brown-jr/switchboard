import { NextResponse } from "next/server";
import { classifySlo, AVAILABILITY_SLO_MS } from "@/lib/slo";
import { publicDemoShopId } from "@/lib/public-demo";

// SLO probe for the availability lookup — the work that runs while a caller
// waits on the line for "what times are open?".
//
// Runs the SAME path the live agent tool runs (getLiveConfig +
// getBusyIntervals + generateOpenSlots) against the public demo shop, which has
// real config and real bookings, and reports how long the COMPUTATION took.
//
// Reports `ms`, not the HTTP round trip, on purpose: during a real call the
// endpoint is warm (hit repeatedly), so warm computation time is what a caller
// actually experiences. Timing the round trip on an hourly probe would measure
// Vercel cold-start noise instead — the false positive that forced the webhook
// checks to loosen their thresholds. Checkly asserts on `$.ms`.
//
// Read-only. No writes, no side effects, safe to probe forever.

export const dynamic = "force-dynamic";

export async function GET() {
  const shopId = publicDemoShopId();
  if (!shopId) {
    // No representative shop to measure — report ok rather than a false breach.
    return NextResponse.json(
      { status: "ok", ms: 0, sloMs: AVAILABILITY_SLO_MS, measured: false },
      { headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  }

  try {
    const { prisma } = await import("@/lib/db");
    const shop = await prisma.shop.findUnique({ where: { id: shopId }, select: { timezone: true } });
    const { getLiveConfig, getBusyIntervals } = await import("@/lib/booking");
    const { generateOpenSlots } = await import("@/lib/scheduling");

    const started = performance.now();
    const config = await getLiveConfig(shopId);
    if (!config) {
      return NextResponse.json(
        { status: "ok", ms: 0, sloMs: AVAILABILITY_SLO_MS, measured: false },
        { headers: { "Cache-Control": "no-store, max-age=0" } },
      );
    }
    const now = new Date();
    const busy = await getBusyIntervals(shopId, now);
    generateOpenSlots({ hours: config.hours, timezone: shop?.timezone ?? null, busy, now });
    const ms = performance.now() - started;

    return NextResponse.json(
      { ...classifySlo(ms), measured: true },
      { headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  } catch {
    // A thrown probe is a real problem, but not necessarily an SLO breach.
    // Report "error" so the check's status assertion fails distinctly from slow.
    return NextResponse.json(
      { status: "error", ms: 0, sloMs: AVAILABILITY_SLO_MS },
      { status: 503, headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  }
}
