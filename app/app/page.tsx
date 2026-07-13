import Link from "next/link";
import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import type { ShopConfig, QaFlag } from "@/lib/schemas";
import { MeetReceptionist } from "./meet-receptionist";
import { SetupChecklist } from "./setup-checklist";
import { Dashboard } from "./dashboard";
import { getDashboardData, getRecentCalls, type Period } from "@/lib/stats";
import { openBillingPortal } from "./subscribe/actions";

export default async function AppHome({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
  const user = await requireUser();
  const shop = await prisma.shop.findFirst({
    where: { ownerId: user.id },
    orderBy: { createdAt: "asc" },
    include: {
      run: { include: { steps: true } },
      versions: { orderBy: { createdAt: "desc" }, take: 1 },
    },
  });

  // No shop yet — first-run welcome.
  if (!shop || !shop.run) {
    return <Welcome />;
  }

  // Live (or paused) → the performance dashboard.
  if (shop.status === "live" || shop.status === "paused") {
    const p = Number((await searchParams).period);
    const period: Period = p === 7 || p === 90 ? p : 30;
    const [data, calls] = await Promise.all([getDashboardData(shop.id, period), getRecentCalls(shop.id)]);
    // Texting (a2p) is optional and doesn't block going live — surface it here so
    // a live owner can still finish registration to turn SMS on.
    const a2pStep = shop.run.steps.find((s) => s.key === "a2p");
    const textingPending =
      !!a2pStep && a2pStep.status !== "done" && a2pStep.status !== "skipped" && shop.a2pStatus !== "approved";
    const pastDue = shop.subStatus === "past_due" || shop.subStatus === "unpaid";
    return (
      <div className="space-y-6">
        {pastDue && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4">
            <p className="font-semibold text-red-800">Payment failed — update your card</p>
            <p className="mt-1 text-sm text-red-700">
              We couldn&apos;t process your latest payment. Your receptionist is still answering for now, but please
              update your card soon to avoid any interruption.
            </p>
            <form action={openBillingPortal} className="mt-3">
              <button type="submit" className="btn-primary">Update payment</button>
            </form>
          </div>
        )}
        {textingPending && (
          <div className="rounded-xl border border-brand-200 bg-brand-50 p-4">
            <p className="font-semibold text-brand-900">Turn on texting (optional)</p>
            <p className="mt-1 text-sm text-brand-800">
              Register your business so your receptionist can text booking alerts and reply to customers. It runs in the
              background and won&apos;t affect your live calls.
            </p>
            <Link href="/app/go-live" className="btn-primary mt-3">
              Set up texting
            </Link>
          </div>
        )}
        <Dashboard shop={shop} data={data} calls={calls} period={period} />
      </div>
    );
  }

  const version = shop.versions[0];
  const config = version ? (version.config as unknown as ShopConfig) : null;
  const flags = (version?.qaFlags as QaFlag[] | null) ?? [];

  // A paused/needs-fix message coming from the engine (generate_config / qa_review).
  const blockingStep = shop.run.steps.find(
    (s) => s.status === "waiting_user" && (s.key === "generate_config" || s.key === "qa_review"),
  );
  const blockMessage = blockingStep?.result
    ? (blockingStep.result as { message?: string }).message
    : undefined;

  const wizardDone = shop.run.steps.find((s) => s.key === "wizard")?.status === "done";
  const current = shop.run.currentStep;
  const runStatus = shop.run.status;
  const isLive = shop.status === "live";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{shop.businessName}</h1>
        <p className="text-sm text-slate-500">{isLive ? "Your receptionist is answering calls." : "Let's get your receptionist live."}</p>
      </div>

      {/* Live banner */}
      {isLive && (
        <div className="rounded-xl border border-green-200 bg-green-50 p-4">
          <p className="font-semibold text-green-800">🎉 You&apos;re live{shop.agentNumber ? ` on ${shop.agentNumber}` : ""}!</p>
          <p className="text-sm text-green-700">Your receptionist is answering calls. Your performance dashboard arrives in the next update.</p>
        </div>
      )}

      {/* Needs-fix banner from the engine (e.g. QA no-go or missing info). */}
      {blockMessage && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <p className="font-medium text-amber-900">{blockMessage}</p>
          <Link href="/app/setup" className="btn-primary mt-3">
            Go to setup
          </Link>
        </div>
      )}

      {/* Subscribe gate — prominent CTA when it's the current step. */}
      {!blockMessage && runStatus === "waiting_user" && current === "subscribe" && (
        <div className="rounded-xl border border-brand-200 bg-brand-50 p-5">
          <p className="font-semibold text-brand-900">Your receptionist is built — hear it, then turn it on</p>
          <p className="mt-1 text-sm text-brand-800">
            Give it a real call right in your browser. Until it&apos;s live, every call you can&apos;t get to still goes
            to voicemail — pick a plan and we&apos;ll set up the phone number and calendar automatically.
          </p>
          <Link href="/app/subscribe" className="btn-primary mt-3">
            Hear it &amp; go live
          </Link>
        </div>
      )}

      {/* Post-provisioning: the final go-live steps (the three walls). */}
      {!blockMessage && !isLive && (current === "test_agent" || current === "forwarding" || current === "a2p") && (
        <div className="rounded-xl border border-brand-200 bg-brand-50 p-5">
          <p className="font-semibold text-brand-900">Almost there — a few final steps to go live 🛠️</p>
          <p className="mt-1 text-sm text-brand-800">
            Your voice, calendar, and phone number are all set up. Finish the quick test call, call forwarding, and
            texting registration to take your receptionist live.
          </p>
          <Link href="/app/go-live" className="btn-primary mt-3">
            Continue setup
          </Link>
        </div>
      )}

      {/* If we have a generated version, show the owner-facing summary. */}
      {config && <MeetReceptionist config={config} qaVerdict={version?.qaVerdict ?? null} qaFlags={flags} />}

      {/* If the wizard isn't finished yet, nudge them to continue. */}
      {!wizardDone && !config && (
        <div className="card p-6">
          <h2 className="text-base font-semibold text-slate-900">Finish setting up</h2>
          <p className="mt-1 text-sm text-slate-500">You started the setup — pick up where you left off.</p>
          <Link href="/app/setup" className="btn-primary mt-4">
            Continue setup
          </Link>
        </div>
      )}

      <SetupChecklist steps={shop.run.steps} />
    </div>
  );
}

function Welcome() {
  return (
    <div className="mx-auto max-w-xl py-10 text-center">
      <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-brand-600 text-2xl text-white">🎧</span>
      <h1 className="mt-5 text-2xl font-bold text-slate-900">Let&apos;s build your receptionist</h1>
      <p className="mt-2 text-slate-600">
        Answer a few quick questions about your shop and we&apos;ll set up a friendly AI receptionist that answers every call
        and books your jobs. About 10 minutes to go.
      </p>
      <p className="mx-auto mt-4 inline-flex items-center gap-1.5 rounded-full bg-green-50 px-3 py-1 text-sm text-green-700">
        <span className="font-semibold">✓</span> Account created — step one is already done.
      </p>
      <div className="mt-6">
        <Link href="/app/setup" className="btn-primary px-5 py-3 text-base">
          Keep going
        </Link>
      </div>
    </div>
  );
}
