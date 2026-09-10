/** Client-safe Stripe mode detection (publishable key) with server secret fallback. */
export function isStripeTestMode(): boolean {
  const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? "";
  if (publishableKey.startsWith("pk_test_")) {
    return true;
  }
  if (publishableKey.startsWith("pk_live_")) {
    return false;
  }

  const secretKey = process.env.STRIPE_SECRET_KEY ?? "";
  return secretKey.startsWith("sk_test_");
}

/** Stripe Connect Dashboard deep link for the given Express account. */
export function getStripeConnectDashboardUrl(accountId: string): string {
  const base = isStripeTestMode()
    ? "https://dashboard.stripe.com/test/connect/accounts"
    : "https://dashboard.stripe.com/connect/accounts";
  return `${base}/${accountId}`;
}

/** Stripe Connect Transfer Dashboard deep link for the platform account. */
export function getStripeTransferDashboardUrl(transferId: string): string {
  const base = isStripeTestMode()
    ? "https://dashboard.stripe.com/test/connect/transfers"
    : "https://dashboard.stripe.com/connect/transfers";
  return `${base}/${transferId}`;
}
