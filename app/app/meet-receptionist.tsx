import type { ShopConfig, QaFlag } from "@/lib/schemas";
import { VOICES, DAY_LABELS } from "@/lib/verticals";

// Owner-facing summary of the generated receptionist. Never shows raw prompt or
// JSON — only plain outcomes: what it knows, always does, and never does.
export function MeetReceptionist({
  config,
  qaVerdict,
  qaFlags,
}: {
  config: ShopConfig;
  qaVerdict: string | null;
  qaFlags: QaFlag[];
}) {
  const services = config.services.filter((s) => s.service.trim());
  const bookable = services.filter((s) => s.bookable);
  const answeredFaqs = config.faqs.filter((f) => f.a.trim());
  const openDays = Object.entries(config.hours)
    .filter(([, h]) => !h.closed && h.open)
    .map(([d, h]) => `${DAY_LABELS[d as keyof typeof DAY_LABELS].slice(0, 3)} ${h.open}–${h.close}`);
  const voice = VOICES.find((v) => v.id === config.voice)?.name ?? config.voice;

  return (
    <div className="card overflow-hidden">
      <div className="border-b border-slate-100 bg-gradient-to-br from-brand-50 to-white p-6">
        <div className="flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-full bg-brand-600 text-lg text-white">🎧</span>
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Meet your receptionist</h2>
            <p className="text-sm text-slate-500">
              Answering as <span className="font-medium text-slate-700">{config.business_name}</span> in the {voice} voice.
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-6 p-6 sm:grid-cols-2">
        <Panel title="What it knows">
          <Bullet label="Services" value={services.map((s) => s.service).join(", ") || "—"} />
          <Bullet label="Hours" value={openDays.join(" · ") || "—"} />
          <Bullet label="Answers ready" value={`${answeredFaqs.length} common question${answeredFaqs.length === 1 ? "" : "s"}`} />
          <Bullet label="Service area" value={config.service_area ?? config.city ?? "—"} />
        </Panel>

        <Panel title="What it always does">
          <Check>Answers every call, day or night</Check>
          <Check>Books {bookable.length} service{bookable.length === 1 ? "" : "s"} onto your calendar</Check>
          <Check>Reads back the details to confirm</Check>
          <Check>Texts you the moment an emergency comes in</Check>
        </Panel>

        <Panel title="What it never does">
          <Cross>Promises an exact price</Cross>
          <Cross>Guesses or diagnoses over the phone</Cross>
          <Cross>Books work you don&apos;t offer</Cross>
        </Panel>

        <Panel title="Emergencies it flags">
          {config.hot_job_rules.length ? (
            <ul className="space-y-1 text-sm text-slate-600">
              {config.hot_job_rules.slice(0, 6).map((r) => (
                <li key={r}>🚨 {r}</li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-slate-400">None set.</p>
          )}
          {config.escalation.alert_number && (
            <p className="mt-2 text-xs text-slate-400">Alerts sent to {config.escalation.alert_number}</p>
          )}
        </Panel>
      </div>

      <div className="border-t border-slate-100 p-6">
        <QaResultBlock verdict={qaVerdict} flags={qaFlags} />
      </div>
    </div>
  );
}

function QaResultBlock({ verdict, flags }: { verdict: string | null; flags: QaFlag[] }) {
  if (verdict === "go") {
    return (
      <div className="flex items-start gap-3 rounded-xl bg-green-50 p-4">
        <span className="text-lg">✅</span>
        <div>
          <p className="font-semibold text-green-800">Ready to go</p>
          <p className="text-sm text-green-700">Your receptionist passed our quality check. Next: give it a real call, then pick a plan to turn it on.</p>
          {flags.length > 0 && (
            <ul className="mt-2 space-y-1 text-sm text-green-700">
              {flags.map((f, i) => (
                <li key={i}>💡 {f.risk}</li>
              ))}
            </ul>
          )}
        </div>
      </div>
    );
  }
  if (verdict === "no_go") {
    return (
      <div className="rounded-xl bg-amber-50 p-4">
        <div className="flex items-center gap-2">
          <span className="text-lg">🛠️</span>
          <p className="font-semibold text-amber-800">A couple of things to fix first</p>
        </div>
        <ul className="mt-3 space-y-2">
          {flags.map((f, i) => (
            <li key={i} className="rounded-lg bg-white/70 p-3 text-sm">
              <p className="font-medium text-amber-900">{f.risk}</p>
              <p className="text-amber-700">→ {f.fix}</p>
            </li>
          ))}
        </ul>
        <a href="/app/setup" className="btn-primary mt-4">
          Fix these in setup
        </a>
      </div>
    );
  }
  return (
    <div className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">Quality check pending…</div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">{title}</h3>
      <div className="mt-2 space-y-1.5">{children}</div>
    </div>
  );
}
function Bullet({ label, value }: { label: string; value: string }) {
  return (
    <p className="text-sm">
      <span className="text-slate-500">{label}: </span>
      <span className="font-medium text-slate-800">{value}</span>
    </p>
  );
}
function Check({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex items-start gap-2 text-sm text-slate-700">
      <span className="text-green-600">✓</span>
      {children}
    </p>
  );
}
function Cross({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex items-start gap-2 text-sm text-slate-700">
      <span className="text-slate-400">✕</span>
      {children}
    </p>
  );
}
