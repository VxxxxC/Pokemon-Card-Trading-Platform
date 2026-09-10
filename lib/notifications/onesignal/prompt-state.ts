const SNOOZE_KEY = "push_optin_snooze_until";
const DISMISSED_KEY = "push_optin_dismissed";
const SNOOZE_DURATION_MS = 7 * 24 * 60 * 60 * 1000;

export const PUSH_OPTIN_STATE_EVENT = "hkcardvault:push-optin-state-changed";

function dispatchStateChange(): void {
  window.dispatchEvent(new Event(PUSH_OPTIN_STATE_EVENT));
}

export function isPushOptInSnoozed(): boolean {
  const snoozeUntil = localStorage.getItem(SNOOZE_KEY);
  return Boolean(snoozeUntil && Date.now() < Number(snoozeUntil));
}

export function isPushOptInDismissed(): boolean {
  return localStorage.getItem(DISMISSED_KEY) === "1";
}

export function shouldShowPushOptIn(): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  if (!("Notification" in window)) {
    return false;
  }

  if (Notification.permission !== "default") {
    return false;
  }

  if (isPushOptInDismissed() || isPushOptInSnoozed()) {
    return false;
  }

  return true;
}

export function snoozePushOptIn(): void {
  localStorage.setItem(SNOOZE_KEY, String(Date.now() + SNOOZE_DURATION_MS));
  dispatchStateChange();
}

export function dismissPushOptIn(): void {
  localStorage.setItem(DISMISSED_KEY, "1");
  dispatchStateChange();
}

export function subscribePushOptInState(callback: () => void): () => void {
  const onChange = () => {
    callback();
  };

  window.addEventListener("storage", onChange);
  window.addEventListener(PUSH_OPTIN_STATE_EVENT, onChange);

  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(PUSH_OPTIN_STATE_EVENT, onChange);
  };
}
