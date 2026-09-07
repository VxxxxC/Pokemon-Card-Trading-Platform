export const PWA_SNOOZE_KEY = "pwa_snooze_until";
export const PWA_SNOOZE_DURATION_MS = 3 * 24 * 60 * 60 * 1000;

export function snoozePwaPrompt(): void {
  if (typeof window === "undefined") return;

  localStorage.setItem(
    PWA_SNOOZE_KEY,
    String(Date.now() + PWA_SNOOZE_DURATION_MS),
  );
  window.dispatchEvent(new Event("hkcardvault:pwa-snooze-changed"));
}

export function subscribePwaSnooze(callback: () => void): () => void {
  window.addEventListener("storage", callback);
  window.addEventListener("hkcardvault:pwa-snooze-changed", callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener("hkcardvault:pwa-snooze-changed", callback);
  };
}

export function getIsPwaSnoozed(): boolean {
  const snoozeUntil = localStorage.getItem(PWA_SNOOZE_KEY);
  if (!snoozeUntil) {
    return false;
  }

  const expiresAt = Number(snoozeUntil);
  if (!Number.isFinite(expiresAt) || Date.now() >= expiresAt) {
    localStorage.removeItem(PWA_SNOOZE_KEY);
    return false;
  }

  return true;
}
