"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { PushOptInBanner } from "@/app/components/notifications/PushOptInBanner";
import { useUIStore } from "@/app/store/useUIStore";
import {
  isOneSignalReady,
  subscribeOneSignalReady,
} from "@/lib/notifications/onesignal/events";
import {
  shouldShowPushOptIn,
  snoozePushOptIn,
  subscribePushOptInState,
} from "@/lib/notifications/onesignal/prompt-state";
import { requestOneSignalPushPermission } from "@/lib/notifications/onesignal/request-permission";
import { getOneSignalAppId } from "@/lib/notifications/onesignal/env";

const PROMPT_DELAY_MS = 2500;

function isLoggedInRole(role: string): boolean {
  return role === "USER" || role === "MERCHANT" || role === "ADMIN";
}

function isPushOptInEligible(): boolean {
  if (!getOneSignalAppId()) {
    return false;
  }

  if (!isOneSignalReady()) {
    return false;
  }

  const oneSignal = window.OneSignal;
  if (!oneSignal?.Notifications.isPushSupported()) {
    return false;
  }

  if (oneSignal.User.PushSubscription.optedIn) {
    return false;
  }

  return shouldShowPushOptIn();
}

function subscribePromptEligibility(callback: () => void): () => void {
  const unsubscribePushState = subscribePushOptInState(callback);
  const unsubscribeOneSignal = subscribeOneSignalReady(callback);

  return () => {
    unsubscribePushState();
    unsubscribeOneSignal();
  };
}

export function OneSignalOptInHost() {
  const userAuthRole = useUIStore((state) => state.userAuthRole);
  const [visible, setVisible] = useState(false);
  const [isEnabling, setIsEnabling] = useState(false);

  const canPrompt = useSyncExternalStore(
    subscribePromptEligibility,
    isPushOptInEligible,
    () => false,
  );

  useEffect(() => {
    if (!isLoggedInRole(userAuthRole) || !canPrompt) {
      setVisible(false);
      return;
    }

    const timer = window.setTimeout(() => {
      setVisible(true);
    }, PROMPT_DELAY_MS);

    return () => {
      window.clearTimeout(timer);
    };
  }, [userAuthRole, canPrompt]);

  const handleEnable = useCallback(async () => {
    setIsEnabling(true);
    try {
      await requestOneSignalPushPermission();
    } finally {
      setIsEnabling(false);
      setVisible(false);
    }
  }, []);

  const handleSnooze = useCallback(() => {
    snoozePushOptIn();
    setVisible(false);
  }, []);

  if (!visible) {
    return null;
  }

  return (
    <PushOptInBanner
      onEnable={() => {
        void handleEnable();
      }}
      onSnooze={handleSnooze}
      isEnabling={isEnabling}
    />
  );
}
