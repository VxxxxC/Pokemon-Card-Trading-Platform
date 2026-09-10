/** Aligns with `rpc_list_merchant_pending_payment_expiry_candidates` (48h from created_at). */
export const MERCHANT_PENDING_PAYMENT_EXPIRY_MS = 48 * 60 * 60 * 1000;

export const MERCHANT_PENDING_PAYMENT_WARNING_MS = 6 * 60 * 60 * 1000;

export function computeMerchantPaymentExpiresAt(createdAt: string): string {
  const created = new Date(createdAt);
  if (Number.isNaN(created.getTime())) {
    return new Date(Date.now() + MERCHANT_PENDING_PAYMENT_EXPIRY_MS).toISOString();
  }
  return new Date(
    created.getTime() + MERCHANT_PENDING_PAYMENT_EXPIRY_MS,
  ).toISOString();
}

export function getMerchantPaymentCountdownMs(expiresAt: string): number {
  const deadline = new Date(expiresAt).getTime();
  if (Number.isNaN(deadline)) {
    return 0;
  }
  return Math.max(deadline - Date.now(), 0);
}

export function isMerchantPaymentExpiringSoon(expiresAt: string): boolean {
  const remaining = getMerchantPaymentCountdownMs(expiresAt);
  return remaining > 0 && remaining <= MERCHANT_PENDING_PAYMENT_WARNING_MS;
}

export function isMerchantPaymentExpired(expiresAt: string): boolean {
  return getMerchantPaymentCountdownMs(expiresAt) <= 0;
}

function padCountdownUnit(value: number): string {
  return String(value).padStart(2, "0");
}

/** e.g. "剩餘 23:45:12" or "已過期" */
export function formatPaymentCountdown(expiresAt: string): string {
  const remainingMs = getMerchantPaymentCountdownMs(expiresAt);
  if (remainingMs <= 0) {
    return "已過期";
  }

  const totalSeconds = Math.floor(remainingMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return `剩餘 ${padCountdownUnit(hours)}:${padCountdownUnit(minutes)}:${padCountdownUnit(seconds)}`;
}

export function formatPaymentDeadline(expiresAt: string): string {
  const date = new Date(expiresAt);
  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const hours = padCountdownUnit(date.getHours());
  const minutes = padCountdownUnit(date.getMinutes());

  return `${year}/${month}/${day} ${hours}:${minutes}`;
}
