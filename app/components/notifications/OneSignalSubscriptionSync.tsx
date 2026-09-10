"use client";

import { useEffect, useRef } from "react";
import type { IOneSignalOneSignal } from "react-onesignal";
import { getPushSubscriptionExternalUserId } from "@/app/actions/push-subscriptions";
import { useUIStore } from "@/app/store/useUIStore";
import {
  isOneSignalReady,
  subscribeOneSignalReady,
} from "@/lib/notifications/onesignal/events";
import {
  loginAndSyncOneSignalUser,
  syncOneSignalPushSubscription,
} from "@/lib/notifications/onesignal/sync-subscription";

function isLoggedInRole(role: string): boolean {
  return role === "USER" || role === "MERCHANT" || role === "ADMIN";
}

export function OneSignalSubscriptionSync() {
  const userAuthRole = useUIStore((state) => state.userAuthRole);
  const syncStartedForUser = useRef<string | null>(null);

  useEffect(() => {
    if (!isLoggedInRole(userAuthRole)) {
      syncStartedForUser.current = null;
      return;
    }

    let cancelled = false;
    let removeSubscriptionListener: (() => void) | undefined;

    const bindSubscriptionListener = (oneSignal: IOneSignalOneSignal) => {
      const onChange = () => {
        void syncOneSignalPushSubscription(oneSignal);
      };

      oneSignal.User.PushSubscription.addEventListener("change", onChange);
      removeSubscriptionListener = () => {
        oneSignal.User.PushSubscription.removeEventListener("change", onChange);
      };
    };

    const startSync = async (oneSignal: IOneSignalOneSignal) => {
      const externalUserId = await getPushSubscriptionExternalUserId();
      if (!externalUserId || cancelled) {
        return;
      }

      if (syncStartedForUser.current === externalUserId) {
        await syncOneSignalPushSubscription(oneSignal);
        return;
      }

      syncStartedForUser.current = externalUserId;
      bindSubscriptionListener(oneSignal);
      await loginAndSyncOneSignalUser(oneSignal, externalUserId);
    };

    const onReady = () => {
      const oneSignal = window.OneSignal;
      if (!oneSignal || cancelled) {
        return;
      }

      void startSync(oneSignal);
    };

    if (isOneSignalReady()) {
      onReady();
    } else {
      const unsubscribe = subscribeOneSignalReady(onReady);
      return () => {
        cancelled = true;
        unsubscribe();
        removeSubscriptionListener?.();
      };
    }

    return () => {
      cancelled = true;
      removeSubscriptionListener?.();
    };
  }, [userAuthRole]);

  return null;
}
