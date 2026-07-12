import Link from "next/link";
import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import type { ShopConfig, QaFlag } from "@/lib/schemas";
import { MeetReceptionist } from "./meet-receptionist";
import { SetupChecklist } from "./setup-checklist";
import { Dashboard } from "./dashboard";
import { getDashboardData, getRecentCalls, type Period } from "@/lib/stats";

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
    return <Dashboard shop={shop} data={data} calls={calls} period={period} />;
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
          <p className="font-semibold text-brand-900">Your receptionist is ready — pick a plan to activate it</p>
          <p className="mt-1 text-sm text-brand-800">We&apos;ll set up the voice, calendar, and phone number automatically once you subscribe.</p>
          <Link href="/app/subscribe" className="btn-primary mt-3">
            Choose your plan
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
        and books your jobs. Takes about 10 minutes.
      </p>
      <Link href="/app/setup" className="btn-primary mt-6 px-5 py-3 text-base">
        Start setup
      </Link>
    </div>
  );
}
