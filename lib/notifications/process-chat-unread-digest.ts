import { sendOneSignalPush } from "@/lib/notifications/onesignal/send";
import { PUSH_CRON_BATCH_LIMIT } from "@/lib/notifications/push-config";
import {
  buildChatUnreadDigestPushCopy,
  shouldSendChatUnreadDigest,
  shouldSkipChatDigestForRecentActivity,
} from "@/lib/notifications/chat-push";
import { loadOptedInPushSubscriptionIds } from "@/lib/notifications/push-delivery";
import { isPushEnabledForUser } from "@/lib/notifications/notification-prefs";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Tables } from "@/types/supabase";

type DigestCandidateRow = {
  user_id: string;
  unread_count: number;
};

type PushSubscriptionRow = Pick<
  Tables<"user_push_subscriptions">,
  "user_id" | "onesignal_subscription_id"
>;

type DigestRpcClient = {
  rpc(
    fn: "rpc_list_chat_unread_digest_candidates",
    args: { p_limit: number },
  ): Promise<{
    data: DigestCandidateRow[] | null;
    error: { message: string } | null;
  }>;
};

export async function processChatUnreadDigest(): Promise<{
  scanned: number;
  sent: number;
  skipped: number;
  errors: string[];
  deliveries: Array<{
    userId: string;
    unreadCount: number;
  }>;
}> {
  const admin = createAdminClient() as unknown as DigestRpcClient;
  const now = new Date();

  const { data: candidates, error: listError } = await admin.rpc(
    "rpc_list_chat_unread_digest_candidates",
    { p_limit: PUSH_CRON_BATCH_LIMIT },
  );

  if (listError) {
    return {
      scanned: 0,
      sent: 0,
      skipped: 0,
      errors: [listError.message],
      deliveries: [],
    };
  }

  const rows = candidates ?? [];
  if (rows.length === 0) {
    return { scanned: 0, sent: 0, skipped: 0, errors: [], deliveries: [] };
  }

  const userIds = rows.map((row) => row.user_id);
  const { data: subscriptions, error: subscriptionsError } =
    await createAdminClient()
      .from("user_push_subscriptions")
      .select("user_id, onesignal_subscription_id")
      .in("user_id", userIds)
      .eq("opted_in", true);

  if (subscriptionsError) {
    return {
      scanned: rows.length,
      sent: 0,
      skipped: 0,
      errors: [subscriptionsError.message],
      deliveries: [],
    };
  }

  const usersWithPush = new Set(
    ((subscriptions ?? []) as PushSubscriptionRow[]).map((row) => row.user_id),
  );

  const { data: activityRows, error: activityError } = await createAdminClient()
    .from("profiles")
    .select("id, last_active_at")
    .in("id", userIds);

  if (activityError) {
    return {
      scanned: rows.length,
      sent: 0,
      skipped: 0,
      errors: [activityError.message],
      deliveries: [],
    };
  }

  const lastActiveByUser = new Map(
    (activityRows ?? []).map((row) => [
      row.id as string,
      (row.last_active_at as string | null) ?? null,
    ]),
  );

  let sent = 0;
  let skipped = 0;
  const errors: string[] = [];
  const deliveries: Array<{ userId: string; unreadCount: number }> = [];

  for (const row of rows) {
    const unreadCount = Number(row.unread_count);
    if (!shouldSendChatUnreadDigest(unreadCount)) {
      skipped += 1;
      continue;
    }

    if (!usersWithPush.has(row.user_id)) {
      skipped += 1;
      continue;
    }

    if (
      shouldSkipChatDigestForRecentActivity(
        lastActiveByUser.get(row.user_id),
        now,
      )
    ) {
      skipped += 1;
      continue;
    }

    if (!(await isPushEnabledForUser(row.user_id, "P-CHT-01"))) {
      skipped += 1;
      continue;
    }

    const copy = buildChatUnreadDigestPushCopy(unreadCount);
    const subscriptionIds = await loadOptedInPushSubscriptionIds(row.user_id);

    const sendResult = await sendOneSignalPush({
      eventId: "P-CHT-01",
      subscriptionIds,
      externalUserIds: [row.user_id],
      heading: copy.heading,
      body: copy.body,
      path: "/profile/user/chat",
    });

    if (!sendResult.success) {
      errors.push(`${row.user_id}: ${sendResult.error}`);
      continue;
    }

    if (sendResult.skipped) {
      skipped += 1;
      continue;
    }

    const { error: updateError } = await createAdminClient()
      .from("profiles")
      .update({ last_chat_digest_pushed_at: now.toISOString() })
      .eq("id", row.user_id);

    if (updateError) {
      errors.push(`${row.user_id}: ${updateError.message}`);
      continue;
    }

    sent += 1;
    deliveries.push({
      userId: row.user_id,
      unreadCount,
    });
  }

  return { scanned: rows.length, sent, skipped, errors, deliveries };
}
