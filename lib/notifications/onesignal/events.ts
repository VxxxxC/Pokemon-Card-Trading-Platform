export const ONESIGNAL_READY_EVENT = "hkcardvault:onesignal-ready";

export function dispatchOneSignalReady(): void {
  window.dispatchEvent(new Event(ONESIGNAL_READY_EVENT));
}

export function subscribeOneSignalReady(callback: () => void): () => void {
  window.addEventListener(ONESIGNAL_READY_EVENT, callback);
  return () => {
    window.removeEventListener(ONESIGNAL_READY_EVENT, callback);
  };
}

export function isOneSignalReady(): boolean {
  return typeof window.OneSignal !== "undefined";
}
