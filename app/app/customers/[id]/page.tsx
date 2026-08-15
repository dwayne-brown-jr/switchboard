import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentShop } from "@/lib/shop";
import { getCustomerDetail, getCustomerTimeline, getOpenBookings, formatCents, formatPhone, type TimelineItem } from "@/lib/customers";
import { StageSelect, TagEditor, NoteEditor, AssetEditor, TimelineNote, BookingCloseOut } from "./controls";

const OUTCOME_CHIP: Record<string, { label: string; chip: string }> = {
  booked: { label: "Booked", chip: "bg-green-100 text-green-700" },
  message: { label: "Message", chip: "bg-brand-100 text-brand-700" },
  escalated: { label: "Emergency", chip: "bg-red-100 text-red-700" },
  missed_recovered: { label: "Recovered", chip: "bg-violet-100 text-violet-700" },
  no_action: { label: "No action", chip: "bg-slate-100 text-slate-500" },
};

const BOOKING_CHIP: Record<string, { label: string; chip: string }> = {
  confirmed: { label: "Booked", chip: "bg-brand-100 text-brand-700" },
  completed: { label: "Job done", chip: "bg-green-100 text-green-700" },
  no_show: { label: "No-show", chip: "bg-amber-100 text-amber-700" },
  canceled: { label: "Cancelled", chip: "bg-slate-100 text-slate-500" },
};

function when(d: Date) {
  return d.toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

// Without this the detail page inherits the marketing site's root title
// ("Switchboard — Never miss another call"), which reads as a landing page in
// the browser tab and in history.
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const shop = await getCurrentShop();
  if (!shop) return { title: "Customer · Switchboard" };
  const c = await getCustomerDetail(shop.id, id);
  const name = c?.displayName ?? formatPhone(c?.phones[0]?.phoneE164 ?? null);
  return { title: c ? `${name} · Customers · Switchboard` : "Customer · Switchboard" };
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
      <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-0.5 font-display text-xl font-bold tabular-nums text-slate-900">{value}</div>
      {hint && <div className="mt-0.5 text-[11px] text-slate-400">{hint}</div>}
    </div>
  );
}

// `params` is a PROMISE in this version of Next and must be awaited.
export default async function CustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const shop = await getCurrentShop();
  if (!shop) notFound();

  // Scoped by shopId inside the query — a customer id from another shop
  // resolves to null here rather than leaking a row.
  const customer = await getCustomerDetail(shop.id, id);
  if (!customer) notFound();

  const [timeline, openBookings] = await Promise.all([getCustomerTimeline(shop.id, customer.id), getOpenBookings(shop.id, customer.id)]);

  const primary = customer.phones[0]?.phoneE164 ?? null;
  const name = customer.displayName ?? formatPhone(primary);

  const valueHint =
    customer.valueBasis === "actual"
      ? "From jobs you closed out"
      : customer.valueBasis === "estimated"
        ? "Estimated from calls — close out a job for the real figure"
        : undefined;

  return (
    <div className="space-y-5">
      <div>
        <Link href="/app/customers" className="text-sm text-slate-500 hover:text-slate-800">
          ← All customers
        </Link>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="font-display text-2xl font-bold text-slate-900">{name}</h1>
            <p className="mt-0.5 text-sm text-slate-500">
              {customer.phones.map((p) => formatPhone(p.phoneE164)).join(" · ")}
              {customer.email && ` · ${customer.email}`}
            </p>
            <p className="mt-0.5 text-xs text-slate-400">
              First heard from {customer.firstSeenAt.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {primary && (
              <a href={`tel:${primary}`} className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800">
                Call back
              </a>
            )}
            <StageSelect customerId={customer.id} stage={customer.stage} />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Calls" value={String(customer.callCount)} />
        <Stat label="Jobs booked" value={String(customer.bookingCount)} />
        <Stat label="No-shows" value={String(customer.noShowCount)} />
        <Stat
          label={customer.valueBasis === "estimated" ? "Est. value" : "Lifetime value"}
          value={customer.lifetimeValue > 0 ? formatCents(customer.lifetimeValue) : "—"}
          hint={valueHint}
        />
      </div>

      {/* The action queue: appointments that happened but were never closed out.
          Until one of these is closed, lifetime value stays an estimate. */}
      {openBookings.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-slate-900">
            Open appointments <span className="font-normal text-slate-400">— close these out to track real revenue</span>
          </h2>
          {openBookings.map((b) => (
            <BookingCloseOut
              key={b.id}
              customerId={customer.id}
              booking={{ id: b.id, startUtc: b.startUtc.toISOString(), service: b.service }}
            />
          ))}
        </section>
      )}

      <div className="grid gap-5 lg:grid-cols-3">
        {/* Timeline */}
        <section className="lg:col-span-2">
          <h2 className="mb-2 text-sm font-semibold text-slate-900">History</h2>
          <TimelineNote customerId={customer.id} />
          <ol className="mt-3 space-y-2">
            {timeline.length === 0 && <li className="text-sm text-slate-400">Nothing recorded yet.</li>}
            {timeline.map((item) => (
              <li key={`${item.kind}-${item.id}`} className="rounded-xl border border-slate-200 bg-white p-3">
                <TimelineRow item={item} />
              </li>
            ))}
          </ol>
        </section>

        {/* Sidebar */}
        <aside className="space-y-5">
          <div>
            <h2 className="mb-1.5 text-sm font-semibold text-slate-900">
              {shop.vertical?.startsWith("auto") ? "Vehicles" : "Property & equipment"}
            </h2>
            <AssetEditor
              customerId={customer.id}
              assets={customer.assets.map((a) => ({ id: a.id, kind: a.kind, label: a.label }))}
              vertical={shop.vertical}
            />
          </div>
          <div>
            <h2 className="mb-1.5 text-sm font-semibold text-slate-900">Tags</h2>
            <TagEditor customerId={customer.id} tags={customer.tags.map((t) => t.label)} />
          </div>
          <div>
            <h2 className="mb-1.5 text-sm font-semibold text-slate-900">Notes</h2>
            <NoteEditor customerId={customer.id} notes={customer.notes} />
          </div>
        </aside>
      </div>
    </div>
  );
}

function TimelineRow({ item }: { item: TimelineItem }) {
  if (item.kind === "call") {
    const o = OUTCOME_CHIP[item.outcome ?? "no_action"] ?? OUTCOME_CHIP.no_action;
    const mins = Math.floor(item.durationSec / 60);
    const secs = item.durationSec % 60;
    return (
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${o.chip}`}>{o.label}</span>
          {item.hotJob && <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">Urgent</span>}
          <span className="text-sm text-slate-700">{item.service ?? item.intent ?? "Call"}</span>
          <span className="ml-auto text-xs text-slate-400">{when(item.at)}</span>
        </div>
        {item.summary && <p className="mt-1.5 text-sm text-slate-600">{item.summary}</p>}
        <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-slate-400">
          <span>
            {mins}:{String(secs).padStart(2, "0")}
          </span>
          {item.recordingUrl && (
            <a href={item.recordingUrl} target="_blank" rel="noopener noreferrer" className="text-brand-600 hover:underline">
              Listen
            </a>
          )}
        </div>
      </div>
    );
  }

  if (item.kind === "booking") {
    const b = BOOKING_CHIP[item.status] ?? BOOKING_CHIP.confirmed;
    return (
      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${b.chip}`}>{b.label}</span>
        <span className="text-sm text-slate-700">{item.service ?? "Appointment"}</span>
        {item.valueCents != null && <span className="text-sm font-medium tabular-nums text-green-700">{formatCents(item.valueCents)}</span>}
        <span className="ml-auto text-xs text-slate-400">{when(item.startUtc)}</span>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium capitalize text-slate-600">{item.eventKind.replace(/_/g, " ")}</span>
      <span className="text-sm text-slate-700">{item.body}</span>
      <span className="ml-auto text-xs text-slate-400">{when(item.at)}</span>
    </div>
  );
}
