import type { IOneSignalOneSignal } from "react-onesignal";
import { upsertUserPushSubscription } from "@/app/actions/push-subscriptions";

export async function syncOneSignalPushSubscription(
  oneSignal: IOneSignalOneSignal,
): Promise<void> {
  const subscriptionId = oneSignal.User.PushSubscription.id;
  if (!subscriptionId) {
    return;
  }

  const result = await upsertUserPushSubscription({
    onesignalSubscriptionId: subscriptionId,
    onesignalUserId: oneSignal.User.onesignalId ?? null,
    optedIn: oneSignal.User.PushSubscription.optedIn ?? false,
  });

  if (process.env.NODE_ENV !== "development") {
    return;
  }

  if (result.success) {
    console.info("[OneSignal] subscription synced to DB", {
      subscriptionId,
      optedIn: oneSignal.User.PushSubscription.optedIn ?? false,
    });
    return;
  }

  console.warn("[OneSignal] subscription sync failed", result.error);
}

export async function loginAndSyncOneSignalUser(
  oneSignal: IOneSignalOneSignal,
  externalUserId: string,
): Promise<void> {
  await syncOneSignalPushSubscription(oneSignal);

  void oneSignal.login(externalUserId).catch((error: unknown) => {
    if (process.env.NODE_ENV !== "development") {
      return;
    }

    console.warn(
      "[OneSignal] external user login timed out (api.onesignal.com blocked or slow). Local push + DB sync still work.",
      error,
    );
  });
}
