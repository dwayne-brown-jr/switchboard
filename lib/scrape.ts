import "server-only";
import dns from "node:dns/promises";
import net from "node:net";

/** Fetches a website and extracts readable text. Best-effort — returns "" on
 *  any failure so the wizard's prefill "magic moment" just silently skips.
 *  SSRF-hardened: only http(s), and every hop (incl. redirects) must resolve to
 *  a public IP — blocks localhost, cloud metadata (169.254.169.254), and RFC-1918. */
export async function scrapeWebsite(url: string): Promise<string> {
  const normalized = normalizeUrl(url);
  if (!normalized) return "";
  try {
    let current = normalized;
    for (let hop = 0; hop < 4; hop++) {
      const u = new URL(current);
      if (u.protocol !== "http:" && u.protocol !== "https:") return "";
      if (!(await hostAllowed(u.hostname))) return "";
      const res = await fetch(current, {
        headers: { "user-agent": "SwitchboardBot/1.0 (+setup prefill)" },
        signal: AbortSignal.timeout(8000),
        redirect: "manual",
      });
      const loc = res.headers.get("location");
      if (res.status >= 300 && res.status < 400 && loc) {
        current = new URL(loc, current).href; // re-validated at the top of the next loop
        continue;
      }
      if (!res.ok) return "";
      const html = await res.text();
      return htmlToText(html).slice(0, 16000);
    }
    return "";
  } catch {
    return "";
  }
}

function isPrivateIp(ip: string): boolean {
  const addr = ip.replace(/^\[|\]$/g, "");
  if (net.isIPv4(addr)) {
    const [a, b] = addr.split(".").map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a >= 224;
  }
  if (net.isIPv6(addr)) {
    const lc = addr.toLowerCase();
    return lc === "::" || lc === "::1" || lc.startsWith("fc") || lc.startsWith("fd") || lc.startsWith("fe80") || lc.startsWith("::ffff:");
  }
  return true; // unknown format → deny
}

async function hostAllowed(hostname: string): Promise<boolean> {
  const lc = hostname.toLowerCase();
  if (!lc || lc === "localhost" || lc.endsWith(".localhost") || lc.endsWith(".local") || lc.endsWith(".internal")) return false;
  if (net.isIP(hostname)) return !isPrivateIp(hostname);
  try {
    const addrs = await dns.lookup(hostname, { all: true });
    return addrs.length > 0 && addrs.every((a) => !isPrivateIp(a.address));
  } catch {
    return false;
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
