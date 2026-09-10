import { afterEach, describe, expect, it, vi } from "vitest";
import type Stripe from "stripe";
import { processMerchantPaymentIntentCanceled, processMerchantPaymentIntentSucceeded } from "@/lib/stripe/merchant-payment-webhook";

type MockAdmin = {
  rpc: ReturnType<typeof vi.fn>;
};

function buildMockAdmin(): MockAdmin {
  return {
    rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
  };
}

function buildMerchantPaymentIntent(
  overrides: Partial<Stripe.PaymentIntent> & {
    metadata?: Stripe.MetadataParam;
  },
): Stripe.PaymentIntent {
  return {
    id: "pi_webhook_test",
    object: "payment_intent",
    amount: 11_500,
    metadata: {
      order_kind: "merchant",
      order_id: "00000000-0000-4000-8000-000000000001",
      buyer_total_amount: "115",
    },
    ...overrides,
  } as Stripe.PaymentIntent;
}

describe("merchant payment webhook handlers", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("I-P0-1b releases coupon on payment_intent.canceled for merchant direct", async () => {
    const admin = buildMockAdmin();
    const paymentIntent = buildMerchantPaymentIntent({});

    const result = await processMerchantPaymentIntentCanceled(
      admin as never,
      paymentIntent,
    );

    expect(result).toEqual({ ok: true });
    expect(admin.rpc).toHaveBeenCalledWith("fn_release_merchant_order_coupon", {
      p_order_id: "00000000-0000-4000-8000-000000000001",
    });
  });

  it("I-R04 rejects succeeded webhook when PI amount mismatches buyer_total_amount", async () => {
    const admin = buildMockAdmin();
    const paymentIntent = buildMerchantPaymentIntent({
      amount: 12_000,
    });

    const result = await processMerchantPaymentIntentSucceeded(
      admin as never,
      paymentIntent,
    );

    expect(result.ok).toBe(false);
    expect(admin.rpc).not.toHaveBeenCalled();
  });

  it("I-R04 allows succeeded webhook when PI amount matches buyer_total_amount", async () => {
    const admin = buildMockAdmin();
    const paymentIntent = buildMerchantPaymentIntent({
      amount: 11_500,
      metadata: {
        order_kind: "merchant",
        order_id: "00000000-0000-4000-8000-000000000002",
        buyer_total_amount: "115",
        total_amount: "145",
      },
    });

    const result = await processMerchantPaymentIntentSucceeded(
      admin as never,
      paymentIntent,
    );

    expect(result).toEqual({ ok: true });
    expect(admin.rpc).toHaveBeenCalledWith("rpc_mark_merchant_order_paid", {
      p_order_id: "00000000-0000-4000-8000-000000000002",
      p_payment_intent_id: "pi_webhook_test",
      p_amounts: {
        buyer_total_amount: "115",
        total_amount: "145",
      },
    });
  });
});
