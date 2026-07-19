import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// Public health endpoint for external monitoring (Checkly).
//
// Deliberately shallow: it proves the app is serving AND that Turso is
// reachable, which is the failure that can happen independently of a deploy.
// It does NOT touch vendors (Retell/Twilio/Stripe/Anthropic) — a third-party
// blip would otherwise page us for something we can't fix, and a health check
// that calls paid APIs every few minutes costs money.
//
// Unauthenticated by necessity (the monitor has no credentials), so it returns
// only a status — never row counts, versions, driver errors, or config.
export const dynamic = "force-dynamic";

export async function GET() {
  const started = Date.now();
  try {
    // Cheapest possible round trip that proves the connection works.
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json(
      { status: "ok", db: "ok", latencyMs: Date.now() - started },
      { status: 200, headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  } catch (e) {
    // Surface it to our own error feed, but keep the public body opaque.
    const { reportError } = await import("@/lib/observability");
    await reportError(e, { source: "request", route: "api/health", level: "error" }).catch(() => {});
    return NextResponse.json(
      { status: "error", db: "unreachable" },
      { status: 503, headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  }
}
