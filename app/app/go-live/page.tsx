import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import { TestAgentWall, ForwardingWall, A2PWall } from "./walls";

const WALLS = [
  { key: "test_agent", label: "Test call" },
  { key: "forwarding", label: "Forwarding" },
  { key: "a2p", label: "Texting" },
];

export default async function GoLivePage() {
  const user = await requireUser();
  const shop = await prisma.shop.findFirst({
    where: { ownerId: user.id },
    orderBy: { createdAt: "asc" },
    include: { run: { include: { steps: true } } },
  });
  if (!shop?.run) redirect("/app");

  const current = shop.run.currentStep ?? "";
  if (!WALLS.some((w) => w.key === current)) redirect("/app");

  const stepResult = (key: string) => shop.run!.steps.find((s) => s.key === key)?.result as Record<string, unknown> | null;
  const agentNumber = shop.agentNumber ?? "your receptionist number";
  // A mock/placeholder number comes from the mock Twilio provider (PNmock…).
  const hasRealNumber = !!shop.twilioNumberSid && !shop.twilioNumberSid.startsWith("PNmock");
  const devMode = process.env.NODE_ENV !== "production";

  return (
    <div className="mx-auto max-w-2xl">
      <Link href="/app" className="text-sm text-slate-500 hover:text-slate-800">
        ← Back to home
      </Link>
      <h1 className="mt-2 text-2xl font-bold text-slate-900">Take your receptionist live</h1>

      {/* Mini progress across the three walls */}
      <div className="mt-4 flex items-center gap-2">
        {WALLS.map((w, i) => {
          const done = shop.run!.steps.find((s) => s.key === w.key)?.status === "done";
          const active = w.key === current;
          return (
            <div key={w.key} className="flex items-center gap-2">
              <span className={`grid h-6 w-6 place-items-center rounded-full text-xs font-semibold ${done ? "bg-brand-600 text-white" : active ? "bg-brand-100 text-brand-700 ring-2 ring-brand-500" : "bg-slate-100 text-slate-400"}`}>
                {done ? "✓" : i + 1}
              </span>
              <span className={`text-xs ${active ? "font-semibold text-slate-800" : "text-slate-400"}`}>{w.label}</span>
              {i < WALLS.length - 1 && <span className="mx-1 text-slate-300">→</span>}
            </div>
          );
        })}
      </div>

      <div className="card mt-6 p-6 sm:p-8">
        {current === "test_agent" && (
          <TestAgentWall
            agentNumber={agentNumber}
            hasRealNumber={hasRealNumber}
            priorNote={(stepResult("test_agent")?.note as string) || undefined}
          />
        )}
        {current === "forwarding" && (
          <ForwardingWall agentNumber={agentNumber} savedCarrier={(stepResult("forwarding")?.carrier as string) || undefined} devMode={devMode} />
        )}
        {current === "a2p" && (
          <A2PWall
            defaults={{
              legalName: shop.businessName,
              phone: shop.businessNumber ?? "",
              contactEmail: user.email,
              address: shop.city ?? "",
              contactName: user.name ?? "",
            }}
          />
        )}
      </div>
    </div>
  );
}
