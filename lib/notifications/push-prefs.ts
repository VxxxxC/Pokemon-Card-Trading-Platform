import {
  classifyPushEvent,
  pushPrefFieldForCategory,
} from "@/lib/notifications/notification-pref-catalog";
import { loadUserNotificationPrefs } from "@/lib/notifications/notification-prefs";

export function isTransactionalPushEvent(eventId: string): boolean {
  return classifyPushEvent(eventId) === "transactional";
}

export async function isUserPushTransactionalEnabled(
  userId: string,
): Promise<boolean> {
  const prefs = await loadUserNotificationPrefs(userId);
  return prefs.push_transactional !== false;
}

export async function isUserPushPrefEnabled(
  userId: string,
  eventId: string,
): Promise<boolean> {
  const category = classifyPushEvent(eventId);
  const field = pushPrefFieldForCategory(category);
  if (!field) {
    return true;
  }

  const prefs = await loadUserNotificationPrefs(userId);
  return prefs[field] !== false;
}
