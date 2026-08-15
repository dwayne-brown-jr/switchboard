"use client";

import { useState, useTransition } from "react";
import { setStage, saveNote, addTag, removeTag, addAsset, removeAsset, addTimelineNote, closeOutBooking } from "../actions";

// Client controls for the customer detail page. Each one calls a server action
// and lets `revalidatePath` refresh the server-rendered data, so none of these
// hold a local copy of the record — the server stays the single source of truth
// and there's no stale-state class of bug to reason about.

function useAction() {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) => {
    setError(null);
    start(async () => {
      const r = await fn();
      if (!r.ok) setError(r.error ?? "Something went wrong.");
    });
  };
  return { pending, error, run };
}

const STAGES = ["lead", "active", "dormant", "lost"] as const;

export function StageSelect({ customerId, stage }: { customerId: string; stage: string }) {
  const { pending, error, run } = useAction();
  return (
    <div>
      <select
        value={stage}
        disabled={pending}
        onChange={(e) => run(() => setStage(customerId, e.target.value))}
        className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-sm capitalize text-slate-700 focus:border-brand-500 focus:outline-none disabled:opacity-50"
      >
        {STAGES.map((s) => (
          <option key={s} value={s} className="capitalize">
            {s}
          </option>
        ))}
      </select>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}

export function TagEditor({ customerId, tags }: { customerId: string; tags: string[] }) {
  const { pending, error, run } = useAction();
  const [value, setValue] = useState("");
  return (
    <div>
      <div className="flex flex-wrap gap-1.5">
        {tags.map((t) => (
          <span key={t} className="group inline-flex items-center gap-1 rounded bg-brand-50 px-2 py-0.5 text-xs text-brand-700">
            {t}
            <button
              type="button"
              disabled={pending}
              onClick={() => run(() => removeTag(customerId, t))}
              className="text-brand-400 transition hover:text-brand-700 disabled:opacity-50"
              aria-label={`Remove tag ${t}`}
            >
              ×
            </button>
          </span>
        ))}
        {tags.length === 0 && <span className="text-xs text-slate-400">No tags yet</span>}
      </div>
      <form
        className="mt-2 flex gap-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          if (!value.trim()) return;
          run(() => addTag(customerId, value));
          setValue("");
        }}
      >
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Add a tag…"
          className="min-w-0 flex-1 rounded border border-slate-300 px-2 py-1 text-xs focus:border-brand-500 focus:outline-none"
        />
        <button type="submit" disabled={pending} className="rounded bg-slate-900 px-2.5 py-1 text-xs text-white hover:bg-slate-800 disabled:opacity-50">
          Add
        </button>
      </form>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}

export function NoteEditor({ customerId, notes }: { customerId: string; notes: string | null }) {
  const { pending, error, run } = useAction();
  const [value, setValue] = useState(notes ?? "");
  const [saved, setSaved] = useState(false);
  const dirty = value !== (notes ?? "");
  return (
    <div>
      <textarea
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          setSaved(false);
        }}
        rows={4}
        placeholder="Anything worth remembering — gate code, preferred tech, what they drive…"
        className="w-full rounded-lg border border-slate-300 px-2.5 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-brand-500 focus:outline-none"
      />
      <div className="mt-1.5 flex items-center gap-2">
        <button
          type="button"
          disabled={pending || !dirty}
          onClick={() =>
            run(async () => {
              const r = await saveNote(customerId, value);
              if (r.ok) setSaved(true);
              return r;
            })
          }
          className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-40"
        >
          {pending ? "Saving…" : "Save note"}
        </button>
        {saved && !dirty && <span className="text-xs text-green-600">Saved</span>}
      </div>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}

export function AssetEditor({
  customerId,
  assets,
  vertical,
}: {
  customerId: string;
  assets: { id: string; kind: string; label: string }[];
  vertical: string | null;
}) {
  const { pending, error, run } = useAction();
  const [label, setLabel] = useState("");
  // Auto repair tracks vehicles; trades track the property they service.
  const defaultKind = vertical?.startsWith("auto") ? "vehicle" : "property";
  const [kind, setKind] = useState(defaultKind);

  return (
    <div>
      <ul className="space-y-1">
        {assets.map((a) => (
          <li key={a.id} className="flex items-center justify-between gap-2 text-sm text-slate-700">
            <span className="flex items-center gap-1.5">
              <span aria-hidden className="text-slate-400">
                {a.kind === "vehicle" ? "🚗" : a.kind === "property" ? "🏠" : "🔧"}
              </span>
              {a.label}
            </span>
            <button
              type="button"
              disabled={pending}
              onClick={() => run(() => removeAsset(customerId, a.id))}
              className="text-xs text-slate-400 hover:text-red-600 disabled:opacity-50"
            >
              Remove
            </button>
          </li>
        ))}
        {assets.length === 0 && <li className="text-xs text-slate-400">Nothing on file yet</li>}
      </ul>
      <form
        className="mt-2 flex gap-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          if (!label.trim()) return;
          run(() => addAsset(customerId, kind, label));
          setLabel("");
        }}
      >
        <select
          value={kind}
          onChange={(e) => setKind(e.target.value)}
          className="rounded border border-slate-300 bg-white px-1.5 py-1 text-xs text-slate-700 focus:border-brand-500 focus:outline-none"
        >
          <option value="vehicle">Vehicle</option>
          <option value="property">Property</option>
          <option value="equipment">Equipment</option>
        </select>
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder={kind === "vehicle" ? "2018 Silverado" : kind === "property" ? "412 Oak St" : "Carrier 3-ton"}
          className="min-w-0 flex-1 rounded border border-slate-300 px-2 py-1 text-xs focus:border-brand-500 focus:outline-none"
        />
        <button type="submit" disabled={pending} className="rounded bg-slate-900 px-2.5 py-1 text-xs text-white hover:bg-slate-800 disabled:opacity-50">
          Add
        </button>
      </form>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}

export function TimelineNote({ customerId }: { customerId: string }) {
  const { pending, error, run } = useAction();
  const [value, setValue] = useState("");
  return (
    <form
      className="flex gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (!value.trim()) return;
        run(() => addTimelineNote(customerId, value));
        setValue("");
      }}
    >
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Log a note — what happened, what you promised…"
        className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm placeholder:text-slate-400 focus:border-brand-500 focus:outline-none"
      />
      <button type="submit" disabled={pending} className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50">
        {pending ? "…" : "Log"}
      </button>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </form>
  );
}

/**
 * Close out an appointment. This is where lifetime value stops being the
 * receptionist's pre-job guess and becomes the money that actually came in —
 * nothing else in the product writes a real job value.
 */
export function BookingCloseOut({
  customerId,
  booking,
}: {
  customerId: string;
  booking: { id: string; startUtc: string; service: string | null };
}) {
  const { pending, error, run } = useAction();
  const [dollars, setDollars] = useState("");
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm">
          <span className="font-medium text-slate-900">{booking.service ?? "Appointment"}</span>
          <span className="ml-2 text-slate-500">
            {new Date(booking.startUtc).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
          </span>
        </div>
        {!open && (
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="rounded-lg bg-green-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-green-700"
            >
              Job done
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => run(() => closeOutBooking(customerId, booking.id, "no_show"))}
              className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
            >
              No-show
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => run(() => closeOutBooking(customerId, booking.id, "canceled"))}
              className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
            >
              Cancelled
            </button>
          </div>
        )}
      </div>

      {open && (
        <form
          className="mt-2 flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const n = dollars.trim() === "" ? null : Number(dollars);
            run(() => closeOutBooking(customerId, booking.id, "completed", n));
          }}
        >
          <label className="text-xs text-slate-600">
            What did it come to?
            <span className="ml-1 text-slate-400">(optional)</span>
          </label>
          <div className="flex items-center gap-1">
            <span className="text-sm text-slate-500">$</span>
            <input
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              value={dollars}
              onChange={(e) => setDollars(e.target.value)}
              placeholder="0.00"
              autoFocus
              className="w-28 rounded border border-slate-300 px-2 py-1 text-sm focus:border-brand-500 focus:outline-none"
            />
          </div>
          <button type="submit" disabled={pending} className="rounded-lg bg-green-600 px-3 py-1 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50">
            {pending ? "Saving…" : "Save"}
          </button>
          <button type="button" onClick={() => setOpen(false)} className="text-xs text-slate-500 hover:text-slate-800">
            Cancel
          </button>
        </form>
      )}
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}
