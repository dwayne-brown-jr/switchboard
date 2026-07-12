import Link from "next/link";
import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import type { ShopConfig } from "@/lib/schemas";
import { configToWizard } from "@/lib/versioning";
import { SettingsEditor } from "./editor";
import { RollbackButton } from "./rollback-button";

export default async function SettingsPage() {
  const user = await requireUser();
  const shop = await prisma.shop.findFirst({
    where: { ownerId: user.id },
    orderBy: { createdAt: "asc" },
    include: { versions: { orderBy: { createdAt: "desc" }, take: 10 } },
  });
  if (!shop) {
    return (
      <div className="py-10 text-center text-slate-500">
        Set up your receptionist first. <Link href="/app" className="text-brand-600 hover:underline">Go to setup →</Link>
      </div>
    );
  }

  // Edit from the live version, or the newest one if not live yet.
  const base =
    shop.versions.find((v) => v.id === shop.liveVersionId) ??
    shop.versions.find((v) => v.status === "live") ??
    shop.versions[0];
  if (!base) {
    return (
      <div className="py-10 text-center text-slate-500">
        Your receptionist isn&apos;t built yet. <Link href="/app/setup" className="text-brand-600 hover:underline">Finish setup →</Link>
      </div>
    );
  }
  const initial = configToWizard(base.config as unknown as ShopConfig, shop);
  const history = shop.versions.filter((v) => v.qaVerdict === "go");

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <Link href="/app" className="text-sm text-slate-500 hover:text-slate-800">← Back to dashboard</Link>
          <h1 className="mt-2 text-2xl font-bold text-slate-900">Edit your receptionist</h1>
          <p className="text-sm text-slate-500">Every change is quality-checked before it goes live. You can always roll back.</p>
        </div>
      </div>

      <SettingsEditor initial={initial} />

      {history.length > 1 && (
        <div className="card mt-8 p-6">
          <h2 className="text-base font-semibold text-slate-900">Version history</h2>
          <p className="mt-1 text-sm text-slate-500">Roll back to any earlier approved version instantly.</p>
          <ul className="mt-4 divide-y divide-slate-100">
            {history.map((v) => (
              <li key={v.id} className="flex items-center justify-between py-2.5">
                <div className="text-sm">
                  <span className="text-slate-700">{v.createdAt.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</span>
                  {v.status === "live" && <span className="ml-2 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">Live now</span>}
                </div>
                {v.status !== "live" && <RollbackButton versionId={v.id} />}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
