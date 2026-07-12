import { NextResponse } from "next/server";
import { z } from "zod";
import { isDemoType, resolveVars, demoAgentEnvKey, type DemoTypeId } from "@/lib/demo";
import { rateLimit } from "@/lib/ratelimit";

// PUBLIC, unauthenticated: mints a Retell web-call access token for the landing
// page's live demo. Abuse controls: strict per-IP rate limit (3 / 10 min),
// input validation + clamping, and it only ever hits the shared demo agents
// (never a real customer agent). Degrades to 503 if demo agents aren't
// configured, so the client falls back to the scripted simulation.
const bodySchema = z.object({
  type: z.string(),
  business: z.string().max(80).optional(),
  city: z.string().max(80).optional(),
  service: z.string().max(80).optional(),
});

export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (!(await rateLimit("demo", ip))) {
    return NextResponse.json({ error: "You've hit the demo limit — try again in a few minutes, or use the preview above." }, { status: 429 });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success || !isDemoType(parsed.data.type)) {
    return NextResponse.json({ error: "invalid request" }, { status: 400 });
  }
  const type = parsed.data.type as DemoTypeId;

  const agentId = process.env[demoAgentEnvKey(type)];
  if (!agentId || !process.env.RETELL_API_KEY) {
    return NextResponse.json({ error: "The live call demo isn't available right now — enjoy the preview above." }, { status: 503 });
  }

  const vars = resolveVars(type, parsed.data);
  try {
    const { createWebCall } = await import("@/lib/integrations/retell");
    const { accessToken } = await createWebCall(agentId, {
      business_name: vars.business,
      city: vars.city,
      primary_service: vars.service,
    });
    return NextResponse.json({ accessToken });
  } catch (e) {
    const { reportError } = await import("@/lib/observability");
    await reportError(e, { source: "request", route: "/api/demo/call", extra: { type } });
    return NextResponse.json({ error: "Couldn't start the demo call. Please try again." }, { status: 502 });
  }
}
