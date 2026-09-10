import { dismissPushOptIn } from "@/lib/notifications/onesignal/prompt-state";
import { syncOneSignalPushSubscription } from "@/lib/notifications/onesignal/sync-subscription";

export async function requestOneSignalPushPermission(): Promise<boolean> {
  const oneSignal = window.OneSignal;
  if (!oneSignal) {
    return false;
  }

  if (!oneSignal.Notifications.isPushSupported()) {
    dismissPushOptIn();
    return false;
  }

  const granted = await oneSignal.Notifications.requestPermission();

  if (Notification.permission !== "default") {
    dismissPushOptIn();
  }

  if (granted) {
    await syncOneSignalPushSubscription(oneSignal);
  }

  return granted;
}
