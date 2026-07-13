import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { stripe } from "@/lib/stripe";
import { prisma } from "@/lib/db";
import { syncSubscription, handleCheckoutCompleted } from "@/lib/billing-sync";
import { reportError } from "@/lib/observability";

// Stripe webhook. Verifies signature, dedupes via WebhookEvent, and syncs
// subscription state. Idempotent — a replayed event is skipped.
export async function POST(req: Request) {
  if (!stripe) return NextResponse.json({ error: "billing not configured" }, { status: 503 });
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: "no webhook secret" }, { status: 503 });

  const sig = req.headers.get("stripe-signature");
  const body = await req.text();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig!, secret);
  } catch (e) {
    return NextResponse.json({ error: `signature: ${(e as Error).message}` }, { status: 400 });
  }

  // Idempotency: record the event id, skip if we've seen it.
  try {
    await prisma.webhookEvent.create({ data: { id: event.id, provider: "stripe" } });
  } catch {
    return NextResponse.json({ received: true, duplicate: true });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed":
        await handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session, stripe);
        break;
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
        await syncSubscription(event.data.object as Stripe.Subscription);
        break;
      default:
        break;
    }
  } catch (e) {
    // Surface the failure to Sentry/Slack + the in-app feed — a silently failing
    // billing sync is otherwise invisible.
    await reportError(e, { source: "webhook", route: "webhooks/stripe", extra: { eventType: event.type, eventId: event.id } });
    // We recorded the event id for idempotency BEFORE handling; drop it so
    // Stripe's automatic retry re-processes instead of being skipped as a dup.
    await prisma.webhookEvent.delete({ where: { id: event.id } }).catch(() => {});
    return NextResponse.json({ error: "handler failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
