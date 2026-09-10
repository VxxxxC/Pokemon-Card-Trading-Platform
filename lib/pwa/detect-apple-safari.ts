/** iOS / iPadOS / macOS Safari — no `beforeinstallprompt`; use Add to Home Screen flow. */
export function isAppleSafariInstallContext(): boolean {
  if (typeof navigator === "undefined") return false;

  const ua = navigator.userAgent;
  const isIOS =
    /iPad|iPhone|iPod/.test(ua) &&
    !(globalThis as { MSStream?: unknown }).MSStream;
  const isMacSafari =
    /Macintosh/.test(ua) &&
    /Safari/.test(ua) &&
    !/Chrome|Chromium|CriOS|FxiOS|Edg/.test(ua);

  return isIOS || isMacSafari;
}
