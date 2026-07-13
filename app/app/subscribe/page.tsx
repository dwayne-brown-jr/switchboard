import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import { hasStripe } from "@/lib/stripe";
import { verticalDef, VOICES, type Vertical } from "@/lib/verticals";
import type { ShopConfig } from "@/lib/schemas";
import { WebCallButton } from "@/components/web-call-button";
import { PlanPicker } from "./plans";

export default async function SubscribePage() {
  const user = await requireUser();
  const shop = await prisma.shop.findFirst({
    where: { ownerId: user.id },
    orderBy: { createdAt: "asc" },
    include: {
      run: { include: { steps: true } },
      versions: { where: { status: { in: ["approved", "live"] } }, orderBy: { createdAt: "desc" }, take: 1 },
    },
  });
  if (!shop?.run) redirect("/app");

  const subscribeStep = shop.run.steps.find((s) => s.key === "subscribe");
  // If they've already subscribed, send them home.
  if (subscribeStep?.status === "done") redirect("/app");
  // Guard: must have passed the quality check first.
  const qaDone = shop.run.steps.find((s) => s.key === "qa_review")?.status === "done";
  if (!qaDone) redirect("/app");

  const config = shop.versions[0] ? (shop.versions[0].config as unknown as ShopConfig) : null;
  const voiceName = config ? (VOICES.find((v) => v.id === config.voice)?.name ?? config.voice) : null;
  const services = config?.services.filter((s) => s.service.trim()) ?? [];
  const answeredFaqs = config?.faqs.filter((f) => f.a.trim()) ?? [];
  const vertical = verticalDef(shop.vertical as Vertical);
  // The receptionist is web-callable once provision_voice has created the agent.
  const canWebCall = Boolean(shop.agentId && shop.agentProvider === "retell");

  return (
    <div>
      <Link href="/app" className="text-sm text-slate-500 hover:text-slate-800">
        ← Back to home
      </Link>
      <div className="mt-3 text-center">
        <h1 className="text-2xl font-bold text-slate-900">
          Turn on {shop.businessName ? `${shop.businessName}’s` : "your"} receptionist
        </h1>
        <p className="mx-auto mt-2 max-w-lg text-slate-600">
          It&apos;s built, quality-checked, and ready to answer. Until it&apos;s live, every call you can&apos;t get
          to still goes to voicemail — pick a plan and we&apos;ll set up the phone number and calendar automatically.
          Cancel anytime.
        </p>
      </div>

      {/* What they built — this is theirs, not a generic product. */}
      {config && (
        <div className="card mx-auto mt-8 max-w-2xl overflow-hidden">
          <div className="flex items-center gap-3 border-b border-slate-100 bg-gradient-to-br from-brand-50 to-white p-5">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-brand-600 text-lg text-white">🎧</span>
            <div>
              <p className="font-semibold text-slate-900">Your receptionist is standing by</p>
              <p className="text-sm text-slate-500">
                Answering as <span className="font-medium text-slate-700">{config.business_name}</span>
                {voiceName ? ` in the ${voiceName} voice` : ""} — it knows your {services.length} service
                {services.length === 1 ? "" : "s"}, your hours,
                {answeredFaqs.length > 0 ? ` ${answeredFaqs.length} answer${answeredFaqs.length === 1 ? "" : "s"},` : ""} and{" "}
                {config.hot_job_rules.length} emergency rule{config.hot_job_rules.length === 1 ? "" : "s"}.
              </p>
            </div>
          </div>
          {canWebCall && (
            <div className="p-5">
              <WebCallButton
                title="Hear it before you pay — talk to it right now"
                subtitle="A real call to your receptionist, right in your browser. No phone, no charge."
                liveHint={`Connected — try booking ${services[0]?.service ? `a ${services[0].service.toLowerCase()}` : "an appointment"}.`}
              />
            </div>
          )}
        </div>
      )}

      <div className="mt-8">
        <PlanPicker stripeConfigured={hasStripe()} />
      </div>

      {/* Anchor the price against the value of one job, not against $0. */}
      <p className="mx-auto mt-6 max-w-lg text-center text-sm text-slate-500">
        For reference: the average {vertical.label.toLowerCase()} job is about ${vertical.avgTicket.toLocaleString()}.
        If your receptionist saves one missed call a month, any plan pays for itself.
      </p>
    </div>
  );
}
