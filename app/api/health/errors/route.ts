import { NextResponse } from "next/server";
import { errorFeedStatus } from "@/lib/health";

// Alerting on our own failure feed.
//
// Every other check asks a question we thought to ask in advance: is the app
// up, is the database reachable, can someone sign in, is the phone ringing.
// This one asks "is anything throwing that wasn't before", which is the only
// check that covers failures nobody predicted — and those are most of them.
//
// reportError() has always written to FailureEvent; nothing ever read it.
//
// Counts only, never routes or messages: this is public and error text
// routinely carries shop names, phone numbers and vendor ids.
//
// Always 200 unless the database is unreachable, so the verdict lives in the
// body and Checkly asserts on `status` rather than a status code.

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const res = await errorFeedStatus();
    return NextResponse.json(res, {
      status: 200,
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  } catch (e) {
    // Deliberately does NOT reportError: a failing error-reporter that reports
    // its own failures is how you turn one outage into a write loop.
    console.error("health/errors failed", (e as Error).message);
    return NextResponse.json(
      { status: "error", db: "unreachable" },
      { status: 503, headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  }
}
