import Link from "next/link";

// Hit when a customer id doesn't resolve — which, importantly, is also what a
// customer belonging to ANOTHER shop looks like. getCustomerDetail filters by
// shopId, so a guessed id returns null and lands here rather than revealing
// that the record exists at all. The wording stays deliberately neutral for
// that reason: "we couldn't find it", never "you can't see it".
export default function CustomerNotFound() {
  return (
    <div className="mx-auto max-w-md py-16 text-center">
      <h1 className="font-display text-xl font-bold text-slate-900">Customer not found</h1>
      <p className="mt-2 text-sm text-slate-600">
        We couldn&apos;t find that customer. They may have been removed, or the link may be out of date.
      </p>
      <Link
        href="/app/customers"
        className="mt-5 inline-block rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
      >
        Back to customers
      </Link>
    </div>
  );
}
