import { NextResponse } from "next/server";
import { capacityStatus } from "@/lib/health";

// Voice-capacity headroom.
//
// Retell caps concurrent calls — measured on this account: limit 20, burst 60,
// purchasable to 180. Nothing tracked it, so the first sign of hitting the
// ceiling would have been callers reaching nothing, which is the single failure
// this product exists to prevent.
//
// Note the deliberate exception to "we don't monitor vendor APIs"
// (MONITORING.md): this is not Retell's uptime, it is OUR headroom against a
// limit we can raise with a support ticket. An unreachable Retell resolves to
// "unknown" and does NOT alert, because that part genuinely isn't actionable.
//
// Counts only — no account identifiers. Safe to serve publicly, though the
// numbers are dull enough that nobody will look.

export const dynamic = "force-dynamic";

export async function GET() {
  const res = await capacityStatus();
  return NextResponse.json(res, {
    status: 200,
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}
