import webPush from "web-push";
import { storage } from "./storage";
import type { PushSubscription } from "@shared/schema";

const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || "";
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || "";
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || "mailto:admin@liahone.app";

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webPush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
}

export interface PushNotificationPayload {
  title: string;
  body?: string;
  icon?: string;
  badge?: string;
  tag?: string;
  url?: string;
  notificationId?: string;
  requireInteraction?: boolean;
  actions?: Array<{ action: string; title: string }>;
}

export async function sendPushNotification(
  userId: string,
  payload: PushNotificationPayload
): Promise<{ success: number; failed: number }> {
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    console.log("Push notifications not configured - VAPID keys missing");
    return { success: 0, failed: 0 };
  }

  const subscriptions = await storage.getPushSubscriptionsByUser(userId);
  
  if (subscriptions.length === 0) {
    return { success: 0, failed: 0 };
  }

  let success = 0;
  let failed = 0;

  for (const sub of subscriptions) {
    try {
      const pushSubscription = {
        endpoint: sub.endpoint,
        keys: {
          p256dh: sub.p256dh,
          auth: sub.auth,
        },
      };

      await webPush.sendNotification(
        pushSubscription,
        JSON.stringify(payload),
        {
          TTL: 86400,
          urgency: "high",
        }
      );
      success++;
    } catch (error: any) {
      console.error("Push notification failed:", error.message);
      
      if (error.statusCode === 410 || error.statusCode === 404) {
        await storage.deletePushSubscriptionByEndpoint(sub.endpoint);
        console.log("Removed expired subscription:", sub.endpoint.substring(0, 50));
      }
      failed++;
    }
  }

  return { success, failed };
}

export async function sendPushToMultipleUsers(
  userIds: string[],
  payload: PushNotificationPayload
): Promise<{ success: number; failed: number }> {
  let totalSuccess = 0;
  let totalFailed = 0;

  for (const userId of userIds) {
    const result = await sendPushNotification(userId, payload);
    totalSuccess += result.success;
    totalFailed += result.failed;
  }

  return { success: totalSuccess, failed: totalFailed };
}

export function getVapidPublicKey(): string {
  return VAPID_PUBLIC_KEY;
}

export function isPushConfigured(): boolean {
  return !!(VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY);
}
