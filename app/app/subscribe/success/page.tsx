import { redirect } from "next/navigation";
import { confirmCheckout } from "../actions";

// Stripe redirects here after a successful Checkout. We confirm the session
// server-side (works locally without a webhook tunnel), which syncs billing and
// advances the run past the subscribe gate, then redirects home.
export default async function CheckoutSuccess({
  searchParams,
}: {
  searchParams: Promise<{ session_id?: string }>;
}) {
  const { session_id } = await searchParams;
  if (!session_id) redirect("/app");
  await confirmCheckout(session_id); // redirects to /app on success
  redirect("/app");
}
