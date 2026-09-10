async function detectBraveBrowser(): Promise<boolean> {
  const brave = (
    navigator as Navigator & {
      brave?: { isBrave?: () => Promise<boolean> };
    }
  ).brave;

  if (!brave?.isBrave) {
    return false;
  }

  try {
    return await brave.isBrave();
  } catch {
    return false;
  }
}

export async function runLocalPushDisplaySmokeTest(): Promise<{
  ok: boolean;
  message: string;
  details?: Record<string, string | boolean | null>;
}> {
  if (typeof window === "undefined") {
    return { ok: false, message: "僅可在 browser 執行" };
  }

  const isBrave = await detectBraveBrowser();
  const details: Record<string, string | boolean | null> = {
    browser: isBrave ? "brave" : "other-chromium",
    origin: window.location.origin,
    permission: Notification.permission,
  };

  if (!("Notification" in window)) {
    return {
      ok: false,
      message: "此 browser 不支援 Notification API",
      details,
    };
  }

  if (Notification.permission !== "granted") {
    return {
      ok: false,
      message: `通知權限為 ${Notification.permission}，請先 Allow`,
      details,
    };
  }

  if (!("serviceWorker" in navigator)) {
    return {
      ok: false,
      message: "此 browser 不支援 Service Worker",
      details,
    };
  }

  const registrations = await navigator.serviceWorker.getRegistrations();
  details.swScopes = registrations.map((registration) => registration.scope).join(" | ") || "none";

  const onesignalRegistration = registrations.find((registration) =>
    registration.scope.includes("/onesignal/"),
  );

  if (!onesignalRegistration) {
    return {
      ok: false,
      message: `找不到 /onesignal/ SW（現有 scopes: ${details.swScopes}）`,
      details,
    };
  }

  await onesignalRegistration.showNotification("HKCardVault 測試", {
    body: "若見到呢個 popup，browser 通知通道正常",
    icon: "/default-icon.png",
    tag: "hkcardvault-push-smoke-test",
    requireInteraction: true,
  });

  const braveHint = isBrave
    ? "（Brave：請檢查 macOS 通知 → Brave Browser，並關閉 localhost Shields）"
    : "";

  return {
    ok: true,
    message: `已呼叫 showNotification${braveHint}`,
    details,
  };
}

export async function logPushClientDiagnostics(
  oneSignal: NonNullable<typeof window.OneSignal>,
): Promise<void> {
  const registrations = await navigator.serviceWorker.getRegistrations();

  console.info("[OneSignal][diag] client", {
    origin: window.location.origin,
    permission: Notification.permission,
    registrations: registrations.map((registration) => ({
      scope: registration.scope,
      active: Boolean(registration.active),
    })),
    onesignalId: oneSignal.User.onesignalId,
    externalId: oneSignal.User.externalId,
    subscriptionId: oneSignal.User.PushSubscription.id,
    optedIn: oneSignal.User.PushSubscription.optedIn,
    smokeTest: "await window.hkPushSmokeTest()",
  });
}

declare global {
  interface Window {
    hkPushSmokeTest?: () => Promise<{
      ok: boolean;
      message: string;
      details?: Record<string, string | boolean | null>;
    }>;
  }
}

export function attachPushDevTools(): void {
  if (process.env.NODE_ENV !== "development") {
    return;
  }

  window.hkPushSmokeTest = runLocalPushDisplaySmokeTest;
}
