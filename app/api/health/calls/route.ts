import { NextResponse } from "next/server";
import { callPathStatus } from "@/lib/health";

// Voice-path health for external monitoring.
//
// /api/health proves the app and database are up. That can be perfectly green
// while the actual product is dead: if a Twilio number stops routing or a shop
// loses its agent version, calls go unanswered and every other check stays
// happy. This is the endpoint that notices.
//
// Counts only, never shop names or ids — this is public and shop counts would
// disclose business scale.
//
// Always 200 unless the database is unreachable; the verdict lives in the body
// so Checkly asserts on `status` rather than on a status code.

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const res = await callPathStatus();
    return NextResponse.json(res, {
      status: 200,
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  } catch (e) {
    const { reportError } = await import("@/lib/observability");
    await reportError(e, { source: "request", route: "api/health/calls", level: "error" }).catch(() => {});
    return NextResponse.json(
      { status: "error", db: "unreachable" },
      { status: 503, headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  }
}
