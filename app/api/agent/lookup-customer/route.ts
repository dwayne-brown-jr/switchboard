import { NextResponse } from "next/server";
import { authAgentShop } from "@/lib/agentAuth";
import { rateLimit } from "@/lib/ratelimit";
import { lookupCallerContext, callerPhoneFromToolBody } from "@/lib/caller-context";

// Agent tool: recognise a returning caller.
//
// This is the one place the CRM reaches back into the phone call — it lets the
// receptionist open with "Hi Dwayne, is this about the Silverado again?" instead
// of asking a ten-year customer who they are.
//
// THE RULE THIS ROUTE LIVES BY: a cold open is fine, dead air is not. Every
// failure mode — unknown caller, bad number, rate limit, database trouble —
// returns HTTP 200 with `{ known: false }` as fast as possible, because the
// alternative is a caller listening to silence while we retry a query. There is
// no error path that makes the agent wait.
export async function POST(req: Request) {
  const shop = await authAgentShop(new URL(req.url));
  if (!shop) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // Even the rate-limited response is a normal "don't know them" — never an
  // error the agent has to interpret mid-sentence.
  if (!(await rateLimit("agentTool", shop.id))) {
    return NextResponse.json({ known: false });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const phone = callerPhoneFromToolBody(body);
    const ctx = await lookupCallerContext(shop.id, phone);
    return NextResponse.json(ctx);
  } catch (e) {
    // Report it, but still answer "unknown" — the call matters more than the
    // lookup. Reporting is awaited only because the serverless function may be
    // frozen the moment we respond.
    const { reportError } = await import("@/lib/observability");
    await reportError(e, { source: "request", route: "/api/agent/lookup-customer", shopId: shop.id });
    return NextResponse.json({ known: false });
  }
}
