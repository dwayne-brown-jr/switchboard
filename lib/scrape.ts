import "server-only";

/** Fetches a website and extracts readable text. Best-effort — returns "" on
 *  any failure so the wizard's prefill "magic moment" just silently skips. */
export async function scrapeWebsite(url: string): Promise<string> {
  const normalized = normalizeUrl(url);
  if (!normalized) return "";
  try {
    const res = await fetch(normalized, {
      headers: { "user-agent": "SwitchboardBot/1.0 (+setup prefill)" },
      signal: AbortSignal.timeout(8000),
      redirect: "follow",
    });
    if (!res.ok) return "";
    const html = await res.text();
    return htmlToText(html).slice(0, 16000);
  } catch {
    return "";
  }
}

function normalizeUrl(url: string): string | null {
  const trimmed = url.trim();
  if (!trimmed) return null;
  try {
    const withProto = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    const u = new URL(withProto);
    return u.href;
  } catch {
    return null;
  }
}

function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#\d+;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
