import "server-only";
import { Client, Receiver } from "@upstash/qstash";

// QStash background jobs (A2P polling, forwarding-verification timeout, weekly
// digests). No-ops cleanly when QSTASH_TOKEN isn't set so dev flows still work —
// the callbacks are also directly callable, so timeouts/polls can be simulated.

const token = process.env.QSTASH_TOKEN;
// QStash tokens are region-bound; pass the region base URL when provided.
const client = token
  ? new Client(process.env.QSTASH_URL ? { token, baseUrl: process.env.QSTASH_URL } : { token })
  : null;
const appUrl = process.env.APP_URL ?? "http://localhost:3000";

export function hasQStash() {
  return client !== null;
}

/** Schedule a one-off job: POST body to `${APP_URL}${path}` after delaySeconds. */
export async function scheduleJob(path: string, body: unknown, delaySeconds: number): Promise<{ scheduled: boolean }> {
  if (!client) {
    console.log(`[qstash:dev] would schedule POST ${path} in ${delaySeconds}s`, body);
    return { scheduled: false };
  }
  await client.publishJSON({
    url: `${appUrl}${path}`,
    body,
    delay: delaySeconds,
  });
  return { scheduled: true };
}

const receiver =
  process.env.QSTASH_CURRENT_SIGNING_KEY && process.env.QSTASH_NEXT_SIGNING_KEY
    ? new Receiver({
        currentSigningKey: process.env.QSTASH_CURRENT_SIGNING_KEY,
        nextSigningKey: process.env.QSTASH_NEXT_SIGNING_KEY,
      })
    : null;

/**
 * Verify an incoming QStash callback signature. In dev (no signing keys) we
 * accept the request so jobs can be triggered/simulated locally.
 */
export async function verifyQStash(req: Request, body: string): Promise<boolean> {
  if (!receiver) return process.env.NODE_ENV !== "production";
  const signature = req.headers.get("upstash-signature") ?? "";
  try {
    return await receiver.verify({ signature, body });
  } catch {
    return false;
  }
}
