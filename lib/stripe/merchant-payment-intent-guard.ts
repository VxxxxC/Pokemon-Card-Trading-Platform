import type Stripe from "stripe";

export type MerchantPaymentIntentGuardResult =
  | { ok: true }
  | { ok: false; reason: string };

function readBuyerTotalAmountCents(
  paymentIntent: Stripe.PaymentIntent,
): number | null {
  const raw = paymentIntent.metadata?.buyer_total_amount?.trim();
  if (!raw) {
    return null;
  }

  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return null;
  }

  return Math.round(parsed * 100);
}

export function validateMerchantPaymentIntentAmount(
  paymentIntent: Stripe.PaymentIntent,
): MerchantPaymentIntentGuardResult {
  const metadata = paymentIntent.metadata ?? {};
  if (metadata.order_kind !== "merchant") {
    return { ok: true };
  }

  if (metadata.capture_mode === "manual") {
    return { ok: true };
  }

  const expectedCents = readBuyerTotalAmountCents(paymentIntent);
  if (expectedCents === null) {
    return { ok: true };
  }

  if (paymentIntent.amount !== expectedCents) {
    return {
      ok: false,
      reason: `PI amount ${paymentIntent.amount} does not match buyer_total_amount ${expectedCents}`,
    };
  }

  return { ok: true };
}
