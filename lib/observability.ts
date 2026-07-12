import "server-only";
import crypto from "node:crypto";
import { prisma } from "./db";
import { parseDsn } from "./sentry-dsn";

// ===========================================================================
// The single choke point for operational errors. Every capture does three
// independent, best-effort things and NEVER throws back into the caller:
//   1. Records a FailureEvent row  → the in-app admin failure feed (always on).
//   2. Structured console.error     → shows up in Vercel logs (always on).
//   3. Forwards to Sentry           → only if SENTRY_DSN is set.
//   4. Forwards to an alert webhook → only if ALERT_WEBHOOK_URL is set (Slack-
//      compatible {text} payload).
// Every external hop is guarded so a misconfigured DSN or a down webhook can
// never break a request or hide the other sinks.
// ===========================================================================

export type FailureSource = "request" | "provisioning" | "webhook" | "job" | "manual";

export interface CaptureContext {
  source: FailureSource;
  route?: string;
  shopId?: string;
  digest?: string;
  level?: "error" | "warn";
  /** Extra structured context — merged into detail alongside the stack. */
  extra?: Record<string, unknown>;
}

export async function reportError(err: unknown, ctx: CaptureContext): Promise<void> {
  const message = err instanceof Error ? err.message : String(err);
  const stack = err instanceof Error ? err.stack : undefined;
  const level = ctx.level ?? "error";

  // 2. Structured log first — cheap and never fails.
  console.error(
    JSON.stringify({ tag: "failure", source: ctx.source, route: ctx.route, shopId: ctx.shopId, message }),
  );

  // 1. Persist to the feed. Best-effort — swallow DB errors.
  try {
    await prisma.failureEvent.create({
      data: {
        source: ctx.source,
        level,
        message: message.slice(0, 1000),
        route: ctx.route ?? null,
        shopId: ctx.shopId ?? null,
        digest: ctx.digest ?? null,
        detail: { stack, ...ctx.extra } as never,
      },
    });
  } catch (e) {
    console.error("failureEvent persist failed", e);
  }

  // 3 & 4. Fan out to external sinks in parallel, never blocking on either.
  await Promise.allSettled([
    sendToSentry(message, stack, level, ctx),
    sendToWebhook(message, ctx),
  ]);
}

// --- Sentry (Store/Envelope HTTP API — no SDK, so no bundler coupling) -------

async function sendToSentry(
  message: string,
  stack: string | undefined,
  level: string,
  ctx: CaptureContext,
): Promise<void> {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return;
  const parsed = parseDsn(dsn);
  if (!parsed) {
    console.error("SENTRY_DSN is malformed — Sentry forwarding disabled");
    return;
  }
  try {
    const eventId = crypto.randomBytes(16).toString("hex");
    const sentAt = new Date().toISOString();
    const event = {
      event_id: eventId,
      timestamp: sentAt,
      level,
      platform: "node",
      environment: process.env.NODE_ENV ?? "production",
      logger: ctx.source,
      transaction: ctx.route,
      tags: { source: ctx.source, route: ctx.route ?? "", shop_id: ctx.shopId ?? "" },
      exception: { values: [{ type: "Error", value: message, stacktrace: stack ? { frames: framesFrom(stack) } : undefined }] },
      extra: ctx.extra,
    };
    const body = `${JSON.stringify({ event_id: eventId, sent_at: sentAt, dsn })}\n${JSON.stringify({ type: "event" })}\n${JSON.stringify(event)}\n`;
    await fetch(parsed.url, {
      method: "POST",
      headers: { "Content-Type": "application/x-sentry-envelope" },
      body,
    });
  } catch (e) {
    console.error("sentry forward failed", e);
  }
}

// Turn a V8 stack string into Sentry frames (oldest-first, as Sentry expects).
function framesFrom(stack: string) {
  return stack
    .split("\n")
    .slice(1)
    .map((line) => line.trim())
    .filter((l) => l.startsWith("at "))
    .map((l) => ({ function: l.replace(/^at\s+/, "") }))
    .reverse();
}

// --- Generic alert webhook (Slack incoming-webhook compatible) ---------------

async function sendToWebhook(message: string, ctx: CaptureContext): Promise<void> {
  const url = process.env.ALERT_WEBHOOK_URL;
  if (!url) return;
  try {
    const where = ctx.route ? ` \`${ctx.route}\`` : "";
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: `🔴 Switchboard ${ctx.source} error${where}: ${message}` }),
    });
  } catch (e) {
    console.error("alert webhook failed", e);
  }
}
