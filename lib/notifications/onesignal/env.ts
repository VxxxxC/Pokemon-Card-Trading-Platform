export function getOneSignalAppId(): string | null {
  return process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID ?? null;
}

export function isOneSignalConfigured(): boolean {
  return Boolean(
    getOneSignalAppId() && process.env.ONESIGNAL_REST_API_KEY,
  );
}
