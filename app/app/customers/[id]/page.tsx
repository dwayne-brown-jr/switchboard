import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentShop } from "@/lib/shop";
import {
  getCustomerDetail,
  getCustomerTimeline,
  getOpenBookings,
  getServiceHistory,
  getUpcomingBooking,
  formatCents,
  formatPhone,
  type TimelineItem,
  type ServiceRecord,
} from "@/lib/customers";
import { StageSelect, TagEditor, NoteEditor, AssetEditor, TimelineNote, BookingCloseOut, NameEditor, ContactFields } from "./controls";

const OUTCOME_CHIP: Record<string, { label: string; chip: string }> = {
  booked: { label: "Booked", chip: "bg-green-100 text-green-700" },
  message: { label: "Message", chip: "bg-brand-100 text-brand-700" },
  escalated: { label: "Emergency", chip: "bg-red-100 text-red-700" },
  missed_recovered: { label: "Recovered", chip: "bg-violet-100 text-violet-700" },
  no_action: { label: "No action", chip: "bg-slate-100 text-slate-500" },
};

const JOB_CHIP: Record<string, { label: string; chip: string }> = {
  completed: { label: "Completed", chip: "bg-green-100 text-green-700" },
  no_show: { label: "No-show", chip: "bg-amber-100 text-amber-700" },
  confirmed: { label: "Not closed out", chip: "bg-slate-100 text-slate-500" },
  canceled: { label: "Cancelled", chip: "bg-slate-100 text-slate-400" },
};

const day = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
const when = (d: Date) => d.toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
      <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-0.5 font-display text-xl font-bold tabular-nums text-slate-900">{value}</div>
      {hint && <div className="mt-0.5 text-[11px] text-slate-400">{hint}</div>}
    </div>
  );
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const shop = await getCurrentShop();
  if (!shop) return { title: "Customer · Switchboard" };
  const c = await getCustomerDetail(shop.id, id);
  const name = c?.displayName ?? formatPhone(c?.phones[0]?.phoneE164 ?? null);
  return { title: c ? `${name} · Customers · Switchboard` : "Customer · Switchboard" };
}

// `params` is a PROMISE in this version of Next and must be awaited.
export default async function CustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const shop = await getCurrentShop();
  if (!shop) notFound();

  const customer = await getCustomerDetail(shop.id, id);
  if (!customer) notFound();

  const [timeline, openBookings, history, upcoming] = await Promise.all([
    getCustomerTimeline(shop.id, customer.id),
    getOpenBookings(shop.id, customer.id),
    getServiceHistory(shop.id, customer.id),
    getUpcomingBooking(shop.id, customer.id),
  ]);

  const primary = customer.phones[0]?.phoneE164 ?? null;
  const fallbackName = formatPhone(primary);

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
            <NameEditor customerId={customer.id} displayName={customer.displayName} fallback={fallbackName} />
            <p className="mt-0.5 text-sm text-slate-500">
              {customer.phones.map((p) => formatPhone(p.phoneE164)).join(" · ")}
            </p>
            <p className="mt-0.5 text-xs text-slate-400">
              Customer since {day(customer.firstSeenAt)} · last heard {day(customer.lastContactAt)}
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

      {/* Next appointment — the single most actionable fact about a customer. */}
      {upcoming && (
        <div className="rounded-xl border border-brand-200 bg-brand-50 px-4 py-3">
          <span className="text-xs font-semibold uppercase tracking-wide text-brand-700">Next appointment</span>
          <p className="mt-0.5 text-sm text-brand-900">
            {upcoming.service ?? "Appointment"} · {when(upcoming.startUtc)}
          </p>
        </div>
      )}

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

      {openBookings.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-slate-900">
            Needs closing out <span className="font-normal text-slate-400">— these appointments have passed</span>
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
        <div className="space-y-5 lg:col-span-2">
          {/* SERVICE HISTORY — jobs, not chatter. Kept separate from the activity
              feed because "what have we done for this truck?" and "when did they
              last call?" are different questions. */}
          <section>
            <h2 className="mb-2 text-sm font-semibold text-slate-900">Service history</h2>
            {history.length === 0 ? (
              <p className="rounded-xl border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-400">
                No work on record yet.
              </p>
            ) : (
              <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                <table className="w-full text-sm">
                  <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-4 py-2 font-medium">Date</th>
                      <th className="px-4 py-2 font-medium">Service</th>
                      <th className="px-4 py-2 font-medium">{shop.vertical?.startsWith("auto") ? "Vehicle" : "Property"}</th>
                      <th className="px-4 py-2 font-medium">Status</th>
                      <th className="px-4 py-2 text-right font-medium">Value</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {history.map((h: ServiceRecord) => {
                      const c = JOB_CHIP[h.status] ?? JOB_CHIP.confirmed;
                      return (
                        <tr key={h.id}>
                          <td className="whitespace-nowrap px-4 py-2.5 text-slate-600">{day(h.at)}</td>
                          <td className="px-4 py-2.5 text-slate-900">{h.service ?? "—"}</td>
                          <td className="px-4 py-2.5 text-slate-600">{h.asset ?? "—"}</td>
                          <td className="px-4 py-2.5">
                            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${c.chip}`}>{c.label}</span>
                          </td>
                          <td className="px-4 py-2.5 text-right tabular-nums text-slate-700">
                            {h.valueCents != null ? formatCents(h.valueCents) : <span className="text-slate-300">—</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section>
            <h2 className="mb-2 text-sm font-semibold text-slate-900">Activity</h2>
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
        </div>

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
            <h2 className="mb-1.5 text-sm font-semibold text-slate-900">Contact details</h2>
            <ContactFields
              customerId={customer.id}
              email={customer.email}
              addressLine={customer.addressLine}
              city={customer.city}
              postalCode={customer.postalCode}
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
    const b = JOB_CHIP[item.status] ?? JOB_CHIP.confirmed;
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
