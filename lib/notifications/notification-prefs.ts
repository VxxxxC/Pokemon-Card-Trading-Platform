import {
  classifyEmailEvent,
  classifyPushEvent,
  emailPrefFieldForCategory,
  pushPrefFieldForCategory,
  type NotificationPrefRecord,
} from "@/lib/notifications/notification-pref-catalog";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Tables } from "@/types/supabase";

type ProfileNotificationPrefRow = Pick<
  Tables<"profiles">,
  | "push_transactional"
  | "push_market_alerts"
  | "push_chat_digest"
  | "push_rewards"
  | "email_transactional"
  | "email_market_alerts"
  | "email_rewards"
>;

function normalizePrefs(
  row: ProfileNotificationPrefRow | null | undefined,
): NotificationPrefRecord {
  return {
    push_transactional: row?.push_transactional !== false,
    push_market_alerts: row?.push_market_alerts !== false,
    push_chat_digest: row?.push_chat_digest !== false,
    push_rewards: row?.push_rewards !== false,
    email_transactional: row?.email_transactional !== false,
    email_market_alerts: row?.email_market_alerts !== false,
    email_rewards: row?.email_rewards !== false,
  };
}

export async function loadUserNotificationPrefs(
  userId: string,
): Promise<NotificationPrefRecord> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("profiles")
    .select(
      "push_transactional, push_market_alerts, push_chat_digest, push_rewards, email_transactional, email_market_alerts, email_rewards",
    )
    .eq("id", userId)
    .maybeSingle<ProfileNotificationPrefRow>();

  if (error) {
    console.warn("[notification-prefs] profile lookup failed", userId, error.message);
    return normalizePrefs(null);
  }

  return normalizePrefs(data);
}

function isPrefEnabled(
  prefs: NotificationPrefRecord,
  field: keyof NotificationPrefRecord | null,
): boolean {
  if (!field) {
    return true;
  }
  return prefs[field] !== false;
}

export async function isPushEnabledForUser(
  userId: string,
  eventId: string,
): Promise<boolean> {
  const category = classifyPushEvent(eventId);
  const field = pushPrefFieldForCategory(category);
  if (!field) {
    return true;
  }

  const prefs = await loadUserNotificationPrefs(userId);
  return isPrefEnabled(prefs, field);
}

export async function isEmailEnabledForUser(
  userId: string,
  eventId: string,
): Promise<boolean> {
  const category = classifyEmailEvent(eventId);
  const field = emailPrefFieldForCategory(category);
  if (!field) {
    return true;
  }

  const prefs = await loadUserNotificationPrefs(userId);
  return isPrefEnabled(prefs, field);
}

export function mapProfileRowToNotificationPrefs(
  row: ProfileNotificationPrefRow,
): NotificationPrefRecord {
  return normalizePrefs(row);
}
