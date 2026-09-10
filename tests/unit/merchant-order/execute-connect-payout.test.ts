import { beforeEach, describe, expect, it, vi } from "vitest";

const stripeMocks = vi.hoisted(() => ({
  paymentIntentsRetrieve: vi.fn(),
  transfersCreate: vi.fn(),
}));

vi.mock("@/lib/stripe/env", () => ({
  getStripeClient: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(),
}));

import { createAdminClient } from "@/lib/supabase/admin";
import { getStripeClient } from "@/lib/stripe/env";
import { executeMerchantConnectPayout } from "@/lib/merchant-order/execute-connect-payout";

const ORDER_ID = "11111111-1111-4111-8111-111111111111";

function buildPreparePayload(merchantPayoutAmount: number) {
  return {
    success: true,
    already_applied: false,
    order_id: ORDER_ID,
    stripe_payment_intent_id: "pi_test_finalize",
    stripe_destination_account_id: "acct_test",
    total_amount: 110,
    buyer_total_amount: 110,
    commission_amount: 10,
    merchant_payout_gross: 100,
    merchant_payout_amount: merchantPayoutAmount,
    recovery_deduction_total: 0,
    recovery_applications: [],
  };
}

describe("executeMerchantConnectPayout P2.5 finalize_failed recovery", () => {
  const prepareRpc = vi.fn();
  const finalizeRpc = vi.fn();
  const markFailedRpc = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();

    const adminClient = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          })),
        })),
      })),
      rpc: vi.fn((fn: string, args: Record<string, unknown>) => {
        if (fn === "rpc_prepare_merchant_order_payout") {
          return prepareRpc(args);
        }
        if (fn === "rpc_finalize_merchant_order_payout") {
          return finalizeRpc(args);
        }
        if (fn === "rpc_mark_merchant_order_payout_failed") {
          return markFailedRpc(args);
        }
        return Promise.resolve({ data: null, error: null });
      }),
    };

    vi.mocked(createAdminClient).mockReturnValue(adminClient as never);
    vi.mocked(getStripeClient).mockResolvedValue({
      paymentIntents: {
        retrieve: stripeMocks.paymentIntentsRetrieve,
      },
      transfers: {
        create: stripeMocks.transfersCreate,
      },
    } as never);

    stripeMocks.paymentIntentsRetrieve.mockResolvedValue({
      status: "succeeded",
      currency: "hkd",
      amount_received: 11_000,
      metadata: { order_id: ORDER_ID },
      latest_charge: "ch_test",
    });
  });

  it("marks payout failed when finalize fails after Stripe transfer", async () => {
    prepareRpc.mockResolvedValue({
      data: buildPreparePayload(100),
      error: null,
    });
    stripeMocks.transfersCreate.mockResolvedValue({
      id: "tr_test_finalize",
      amount: 10_000,
      destination: "acct_test",
    });
    finalizeRpc.mockResolvedValue({
      data: null,
      error: { message: "finalize_db_error" },
    });
    markFailedRpc.mockResolvedValue({ data: { success: true }, error: null });

    const result = await executeMerchantConnectPayout(ORDER_ID);

    expect(result).toEqual({
      success: false,
      orderId: ORDER_ID,
      error: "finalize_failed",
    });
    expect(markFailedRpc).toHaveBeenCalledWith({
      p_order_id: ORDER_ID,
      p_error: "finalize_failed: finalize_db_error",
    });
    expect(stripeMocks.transfersCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 10_000,
        destination: "acct_test",
      }),
      { idempotencyKey: `merchant-order-payout:${ORDER_ID}` },
    );
  });

  it("marks payout failed when zero-net finalize fails", async () => {
    prepareRpc.mockResolvedValue({
      data: buildPreparePayload(0),
      error: null,
    });
    finalizeRpc.mockResolvedValue({
      data: null,
      error: { message: "zero_net_finalize_error" },
    });
    markFailedRpc.mockResolvedValue({ data: { success: true }, error: null });

    const result = await executeMerchantConnectPayout(ORDER_ID);

    expect(result).toEqual({
      success: false,
      orderId: ORDER_ID,
      error: "finalize_failed",
    });
    expect(markFailedRpc).toHaveBeenCalledWith({
      p_order_id: ORDER_ID,
      p_error: "finalize_failed: zero_net_finalize_error",
    });
    expect(stripeMocks.transfersCreate).not.toHaveBeenCalled();
  });

  it("does not mark failed when finalize succeeds", async () => {
    prepareRpc.mockResolvedValue({
      data: buildPreparePayload(100),
      error: null,
    });
    stripeMocks.transfersCreate.mockResolvedValue({
      id: "tr_test_ok",
      amount: 10_000,
      destination: "acct_test",
    });
    finalizeRpc.mockResolvedValue({ data: { success: true }, error: null });

    const result = await executeMerchantConnectPayout(ORDER_ID);

    expect(result).toEqual({
      success: true,
      orderId: ORDER_ID,
      transferId: "tr_test_ok",
    });
    expect(markFailedRpc).not.toHaveBeenCalled();
  });
});
