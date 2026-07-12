// Pure DSN → ingest-URL parsing, split out from observability.ts (which is
// server-only) so it can be unit-tested. A silently-wrong parser means Sentry
// events vanish without a trace, so this is the piece worth pinning down.

export interface ParsedDsn {
  /** Full envelope ingest URL incl. auth query params. */
  url: string;
  publicKey: string;
}

/**
 * Parse a Sentry DSN of the form
 *   https://<publicKey>@<host>[/<pathPrefix>]/<projectId>
 * into the envelope endpoint. Returns null for anything malformed.
 */
export function parseDsn(dsn: string): ParsedDsn | null {
  const m = /^(https?):\/\/([^@]+)@([^/]+)\/(.+)$/.exec(dsn.trim());
  if (!m) return null;
  const [, protocol, publicKey, host, path] = m;
  const segments = path.split("/").filter(Boolean);
  const projectId = segments.pop();
  if (!projectId || !publicKey) return null;
  const prefix = segments.length ? `/${segments.join("/")}` : "";
  const base = `${protocol}://${host}${prefix}`;
  return { url: `${base}/api/${projectId}/envelope/?sentry_key=${publicKey}&sentry_version=7`, publicKey };
}
