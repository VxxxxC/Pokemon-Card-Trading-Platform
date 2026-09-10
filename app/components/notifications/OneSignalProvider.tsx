"use client";

import Script from "next/script";
import { useRef, type ReactNode } from "react";
import {
  ONESIGNAL_SDK_SCRIPT_SRC,
  ONESIGNAL_SERVICE_WORKER_PATH,
  ONESIGNAL_SERVICE_WORKER_SCOPE,
  ONESIGNAL_SERVICE_WORKER_UPDATER_PATH,
} from "@/lib/notifications/onesignal/client";
import {
  attachPushDevTools,
  logPushClientDiagnostics,
} from "@/lib/notifications/onesignal/dev-diagnostics";
import { getOneSignalAppId } from "@/lib/notifications/onesignal/env";
import type { OneSignalInitOptions } from "@/lib/notifications/onesignal/types";
import { dispatchOneSignalReady } from "@/lib/notifications/onesignal/events";

function bindForegroundNotifications(
  oneSignal: NonNullable<typeof window.OneSignal>,
): void {
  oneSignal.Notifications.addEventListener("foregroundWillDisplay", (event) => {
    if (process.env.NODE_ENV === "development") {
      console.info("[OneSignal] foregroundWillDisplay", {
        id: event.notification.notificationId,
        title: event.notification.title,
      });
    }

    event.notification.display();
  });
}

function runOneSignalInit(appId: string) {
  const initOptions: OneSignalInitOptions = {
    appId,
    path: "/",
    allowLocalhostAsSecureOrigin: process.env.NODE_ENV === "development",
    serviceWorkerPath: ONESIGNAL_SERVICE_WORKER_PATH,
    serviceWorkerUpdaterPath: ONESIGNAL_SERVICE_WORKER_UPDATER_PATH,
    serviceWorkerParam: { scope: ONESIGNAL_SERVICE_WORKER_SCOPE },
    serviceWorkerOverrideForTypical: true,
  };

  window.OneSignalDeferred = window.OneSignalDeferred || [];
  window.OneSignalDeferred.push(async (oneSignal) => {
    if (process.env.NODE_ENV === "development") {
      oneSignal.Debug.setLogLevel("trace");
      attachPushDevTools();
    }

    await oneSignal.init(initOptions);
    bindForegroundNotifications(oneSignal);
    dispatchOneSignalReady();

    if (process.env.NODE_ENV !== "development") {
      return;
    }

    await logPushClientDiagnostics(oneSignal);
  });
}

export function OneSignalProvider({ children }: { children: ReactNode }) {
  const appId = getOneSignalAppId();
  const initStarted = useRef(false);

  if (!appId) {
    return <>{children}</>;
  }

  return (
    <>
      <Script
        id="onesignal-sdk"
        src={ONESIGNAL_SDK_SCRIPT_SRC}
        strategy="afterInteractive"
        onLoad={() => {
          if (initStarted.current) {
            return;
          }

          initStarted.current = true;
          runOneSignalInit(appId);
        }}
        onError={() => {
          initStarted.current = false;
          console.error(
            "[OneSignal] SDK script failed to load from /vendor/onesignal. Hard refresh and check Network tab.",
          );
        }}
      />
      {children}
    </>
  );
}
