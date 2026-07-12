import Link from "next/link";
import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import { wizardSchema, type WizardData } from "@/lib/schemas";
import { SetupWizard } from "./wizard";

export default async function SetupPage() {
  const user = await requireUser();
  const shop = await prisma.shop.findFirst({
    where: { ownerId: user.id },
    orderBy: { createdAt: "asc" },
    include: { run: { include: { steps: true } } },
  });

  // Load any saved wizard progress from the wizard step.
  let initial: WizardData | null = null;
  const wizardStep = shop?.run?.steps.find((s) => s.key === "wizard");
  if (wizardStep?.result) {
    const parsed = wizardSchema.safeParse(wizardStep.result);
    if (parsed.success) initial = parsed.data;
  }

  return (
    <div>
      <div className="mb-6">
        <Link href="/app" className="text-sm text-slate-500 hover:text-slate-800">
          ← Back to home
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-slate-900">Set up your receptionist</h1>
      </div>
      <SetupWizard initial={initial} />
    </div>
  );
}
