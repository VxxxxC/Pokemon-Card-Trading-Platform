import { createAdminClient } from "@/lib/supabase/admin";
import { sendOneSignalPush } from "@/lib/notifications/onesignal/send";
import { isUserPushPrefEnabled } from "@/lib/notifications/push-prefs";

export async function loadOptedInPushSubscriptionIds(
  userId: string,
): Promise<string[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("user_push_subscriptions")
    .select("onesignal_subscription_id")
    .eq("user_id", userId)
    .eq("opted_in", true);

  if (error) {
    console.warn("[push-delivery] subscription lookup failed", error.message);
    return [];
  }

  return (data ?? [])
    .map((row) => row.onesignal_subscription_id.trim())
    .filter((id) => id.length > 0);
}

export async function sendPushToUser(input: {
  eventId: string;
  userId: string;
  heading: string;
  body: string;
  path: string;
}): Promise<void> {
  if (!(await isUserPushPrefEnabled(input.userId, input.eventId))) {
    if (process.env.NODE_ENV === "development") {
      console.info(
        "[push-delivery]",
        input.eventId,
        "skipped",
        "notification_pref_disabled",
      );
    }
    return;
  }

  const subscriptionIds = await loadOptedInPushSubscriptionIds(input.userId);
  const result = await sendOneSignalPush({
    eventId: input.eventId,
    subscriptionIds,
    externalUserIds: [input.userId],
    heading: input.heading,
    body: input.body,
    path: input.path,
  });

  if (!result.success) {
    console.warn("[push-delivery]", input.eventId, result.error);
    return;
  }

  if (result.skipped) {
    if (process.env.NODE_ENV === "development") {
      console.info("[push-delivery]", input.eventId, "skipped", result.reason);
    }
    return;
  }

  if (process.env.NODE_ENV === "development") {
    console.info("[push-delivery]", input.eventId, "sent", {
      userId: input.userId,
      notificationId: result.notificationId,
      targeting: result.targeting,
    });
  }
}
