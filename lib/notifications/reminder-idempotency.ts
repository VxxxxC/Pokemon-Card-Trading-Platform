/** Daily bucket for reminder idempotency (SSOT: max 1 email / 24h per order + event). */
export function buildDailyReminderIdempotencySuffix(): string {
  return new Date().toISOString().slice(0, 10);
}
