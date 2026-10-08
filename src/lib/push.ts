import webpush from "web-push";
import type { PrismaClient } from "@prisma/client";
import { prisma } from "./db";

export type PushPayload = {
  title: string;
  body: string;
  url?: string;
};

let configured = false;

function ensureConfigured(): boolean {
  if (configured) return true;
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) return false;
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT ?? "mailto:portal@atheneummartialarts.com",
    publicKey,
    privateKey
  );
  configured = true;
  return true;
}

export function vapidPublicKey(): string | null {
  return process.env.VAPID_PUBLIC_KEY ?? null;
}

/**
 * Sends a push notification to every subscription belonging to the given
 * users. Subscriptions the push service reports as gone are deleted.
 */
export async function sendPushToUsers(
  userIds: string[],
  payload: PushPayload,
  db: PrismaClient = prisma
): Promise<number> {
  if (userIds.length === 0 || !ensureConfigured()) return 0;
  const subscriptions = await db.pushSubscription.findMany({
    where: { userId: { in: userIds } },
  });

  let delivered = 0;
  for (const sub of subscriptions) {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        JSON.stringify(payload)
      );
      delivered += 1;
    } catch (err) {
      const statusCode = (err as { statusCode?: number }).statusCode;
      if (statusCode === 404 || statusCode === 410) {
        await db.pushSubscription.delete({ where: { id: sub.id } }).catch(() => {});
      } else {
        console.error(`[push] Failed to send to subscription ${sub.id}:`, err);
      }
    }
  }
  return delivered;
}
