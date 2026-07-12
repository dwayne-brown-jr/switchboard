import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import { hasStripe } from "@/lib/stripe";
import { PlanPicker } from "./plans";

export default async function SubscribePage() {
  const user = await requireUser();
  const shop = await prisma.shop.findFirst({
    where: { ownerId: user.id },
    orderBy: { createdAt: "asc" },
    include: { run: { include: { steps: true } } },
  });
  if (!shop?.run) redirect("/app");

  const subscribeStep = shop.run.steps.find((s) => s.key === "subscribe");
  // If they've already subscribed, send them home.
  if (subscribeStep?.status === "done") redirect("/app");
  // Guard: must have passed the quality check first.
  const qaDone = shop.run.steps.find((s) => s.key === "qa_review")?.status === "done";
  if (!qaDone) redirect("/app");

  return (
    <div>
      <Link href="/app" className="text-sm text-slate-500 hover:text-slate-800">
        ← Back to home
      </Link>
      <div className="mt-3 text-center">
        <h1 className="text-2xl font-bold text-slate-900">Choose your plan</h1>
        <p className="mx-auto mt-2 max-w-lg text-slate-600">
          Your receptionist is built and passed our quality check. Pick a plan to activate it — we&apos;ll set up the voice,
          calendar, and phone number automatically. Cancel anytime.
        </p>
      </div>
      <div className="mt-8">
        <PlanPicker stripeConfigured={hasStripe()} />
      </div>
    </div>
  );
}
