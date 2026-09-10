"use server";

import { revalidatePath } from "next/cache";
import type { NotificationPreferenceField } from "@/lib/notifications/notification-pref-catalog";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/supabase";

type NotificationPreferenceResult =
  | { success: true }
  | { success: false; error: string };

type ProfileNotificationPrefUpdate = Pick<
  Database["public"]["Tables"]["profiles"]["Update"],
  NotificationPreferenceField | "updated_at"
>;

const PREFERENCE_COLUMN_LABELS: Record<NotificationPreferenceField, string> = {
  push_transactional: "push_transactional",
  push_market_alerts: "push_market_alerts",
  push_chat_digest: "push_chat_digest",
  push_rewards: "push_rewards",
  email_transactional: "email_transactional",
  email_market_alerts: "email_market_alerts",
  email_rewards: "email_rewards",
};

export async function updateNotificationPreference(
  field: NotificationPreferenceField,
  enabled: boolean,
): Promise<NotificationPreferenceResult> {
  if (!isSupabaseConfigured()) {
    return { success: false, error: "未登入" };
  }

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: "請先登入" };
    }

    const payload: ProfileNotificationPrefUpdate = {
      [field]: enabled,
      updated_at: new Date().toISOString(),
    };

    const profilesClient = supabase.from("profiles") as unknown as {
      update: (values: ProfileNotificationPrefUpdate) => {
        eq: (
          column: "id",
          value: string,
        ) => Promise<{ error: { message: string } | null }>;
      };
    };

    const { error } = await profilesClient.update(payload).eq("id", user.id);

    if (error) {
      console.error("[updateNotificationPreference]", field, error.message);
      if (error.message.includes(PREFERENCE_COLUMN_LABELS[field])) {
        return { success: false, error: "資料庫尚未更新，請聯絡管理員" };
      }
      return { success: false, error: "無法更新通知設定" };
    }

    revalidatePath("/profile/user/settings");

    return { success: true };
  } catch (error) {
    console.error("[updateNotificationPreference]", field, error);
    return { success: false, error: "無法更新通知設定" };
  }
}
