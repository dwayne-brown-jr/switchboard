import "server-only";
import { prisma } from "./db";

// Expo push notifications for the owner mobile app. Uses Expo's push service
// directly (no SDK) so there's no vendor coupling. Everything here is best-effort
// and never throws into the caller — a push failure must not break call ingest.

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

export interface PushMessage {
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

/** Send an Expo push to a set of tokens. Silently drops non-Expo tokens. */
export async function sendExpoPush(tokens: string[], msg: PushMessage): Promise<void> {
  const valid = tokens.filter((t) => t && t.startsWith("ExponentPushToken"));
  if (valid.length === 0) return;
  const messages = valid.map((to) => ({ to, title: msg.title, body: msg.body, data: msg.data, sound: "default" }));
  try {
    await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(messages),
    });
  } catch (e) {
    console.error("expo push failed", e);
  }
}

/** Push to every device an owner has registered. Best-effort. */
export async function pushToOwner(ownerId: string, msg: PushMessage): Promise<void> {
  const devices = await prisma.deviceToken.findMany({
    where: { userId: ownerId, pushToken: { not: null } },
    select: { pushToken: true },
  });
  const tokens = devices.map((d) => d.pushToken!).filter(Boolean);
  if (tokens.length) await sendExpoPush(tokens, msg);
}
