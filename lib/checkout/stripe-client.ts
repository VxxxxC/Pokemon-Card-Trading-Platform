import { loadStripe, type Stripe as StripeJs } from "@stripe/stripe-js";

const stripePromiseCache = new Map<string, Promise<StripeJs | null>>();

export function getStripePromise(publishableKey: string): Promise<StripeJs | null> {
  const cached = stripePromiseCache.get(publishableKey);
  if (cached) {
    return cached;
  }
  const promise = loadStripe(publishableKey);
  stripePromiseCache.set(publishableKey, promise);
  return promise;
}

export function isPaymentIntentAuthorized(status: string | undefined): boolean {
  return (
    status === "succeeded" ||
    status === "processing" ||
    status === "requires_capture"
  );
}
