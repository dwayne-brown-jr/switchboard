import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "./auth";
import { isAdminEmail } from "./admin";

/** Returns the current session (user + session) or null. Server-only. */
export async function getSession() {
  return auth.api.getSession({ headers: await headers() });
}

/** Requires a signed-in user; redirects to /login otherwise. */
export async function requireUser() {
  const session = await getSession();
  if (!session?.user) redirect("/login");
  return session.user;
}

/**
 * Requires an admin. Double-gated: the ADMIN_EMAILS env allowlist OR the
 * User.isAdmin DB flag. Redirects non-admins to /app.
 */
export async function requireAdmin() {
  const session = await getSession();
  if (!session?.user) redirect("/login");
  const user = session.user as typeof session.user & { isAdmin?: boolean };
  const ok = isAdminEmail(user.email) || user.isAdmin === true;
  if (!ok) redirect("/app");
  return user;
}
