"use server";

import { updateNotificationPreference } from "@/app/actions/notification-preferences";

type PushPreferenceResult =
  | { success: true }
  | { success: false; error: string };

export async function updatePushTransactionalPreference(
  enabled: boolean,
): Promise<PushPreferenceResult> {
  return updateNotificationPreference("push_transactional", enabled);
}
