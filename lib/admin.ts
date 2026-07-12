/**
 * Admin gate. Double-gated per spec: the User.isAdmin DB flag AND the
 * ADMIN_EMAILS env allowlist. isAdminEmail is the source of truth for env;
 * requireAdmin (in lib/session.ts) combines both.
 */
export function adminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return adminEmails().includes(email.toLowerCase());
}
