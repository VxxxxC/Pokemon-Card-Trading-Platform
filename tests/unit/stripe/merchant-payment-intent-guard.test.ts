import { describe, expect, it } from "vitest";
import type Stripe from "stripe";
import { validateMerchantPaymentIntentAmount } from "@/lib/stripe/merchant-payment-intent-guard";

function buildPaymentIntent(
  overrides: Partial<Stripe.PaymentIntent> & {
    metadata?: Stripe.MetadataParam;
  },
): Stripe.PaymentIntent {
  return {
    id: "pi_test",
    object: "payment_intent",
    amount: 11_500,
    metadata: {},
    ...overrides,
  } as Stripe.PaymentIntent;
}

describe("validateMerchantPaymentIntentAmount", () => {
  it("accepts matching buyer_total_amount for merchant direct capture", () => {
    const result = validateMerchantPaymentIntentAmount(
      buildPaymentIntent({
        amount: 11_500,
        metadata: {
          order_kind: "merchant",
          order_id: "order-1",
          buyer_total_amount: "115",
        },
      }),
    );

    expect(result).toEqual({ ok: true });
  });

  it("rejects amount mismatch by one cent", () => {
    const result = validateMerchantPaymentIntentAmount(
      buildPaymentIntent({
        amount: 11_499,
        metadata: {
          order_kind: "merchant",
          order_id: "order-1",
          buyer_total_amount: "115",
        },
      }),
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toMatch(/does not match/);
    }
  });

  it("skips guard when buyer_total_amount metadata is missing", () => {
    const result = validateMerchantPaymentIntentAmount(
      buildPaymentIntent({
        amount: 99_999,
        metadata: {
          order_kind: "merchant",
          order_id: "order-1",
        },
      }),
    );

    expect(result).toEqual({ ok: true });
  });

  it("skips guard for manual capture merchant auth orders", () => {
    const result = validateMerchantPaymentIntentAmount(
      buildPaymentIntent({
        amount: 99_999,
        metadata: {
          order_kind: "merchant",
          order_id: "order-1",
          capture_mode: "manual",
          buyer_total_amount: "115",
        },
      }),
    );

    expect(result).toEqual({ ok: true });
  });
});
