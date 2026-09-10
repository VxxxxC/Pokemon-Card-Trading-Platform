import { beforeEach, describe, expect, it, vi } from "vitest";

const stripeMocks = vi.hoisted(() => ({
  cancel: vi.fn(),
  capture: vi.fn(),
  retrieve: vi.fn(),
  refundsCreate: vi.fn(),
}));

const refreshMocks = vi.hoisted(() => ({
  ensureAuthEscrowAuthorizationFresh: vi.fn(),
}));

vi.mock("@/lib/stripe", () => ({
  stripe: {
    paymentIntents: {
      cancel: stripeMocks.cancel,
      capture: stripeMocks.capture,
      retrieve: stripeMocks.retrieve,
    },
    refunds: {
      create: stripeMocks.refundsCreate,
    },
  },
}));

vi.mock("@/lib/payments/auth-authorization-refresh", () => ({
  ensureAuthEscrowAuthorizationFresh: refreshMocks.ensureAuthEscrowAuthorizationFresh,
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(),
}));

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { runAuthGradingFailVoidSaga } from "@/lib/payments/auth-grading-fail-void-saga";

describe("auth-grading-fail-void-saga", () => {
  const finalizeRpc = vi.fn();
  const markFailedRpc = vi.fn();
  const prepareRpc = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();

    const rpcClient = {
      rpc: vi.fn((fn: string, args: Record<string, unknown>) => {
        if (fn === "rpc_prepare_auth_grading_fail") {
          return prepareRpc(args);
        }
        if (fn === "rpc_finalize_auth_grading_fail") {
          finalizeRpc(args);
          return Promise.resolve({ data: { success: true }, error: null });
        }
        if (fn === "rpc_mark_auth_grading_fail_failed") {
          markFailedRpc(args);
          return Promise.resolve({ data: { success: true }, error: null });
        }
        return Promise.resolve({ data: null, error: null });
      }),
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: null, error: null }),
          }),
        }),
      }),
    };

    vi.mocked(createClient).mockResolvedValue(rpcClient as never);
    vi.mocked(createAdminClient).mockReturnValue(rpcClient as never);

    stripeMocks.cancel.mockResolvedValue({ id: "pi_cancelled" });
    stripeMocks.capture.mockResolvedValue({ id: "pi_captured" });
    stripeMocks.retrieve.mockResolvedValue({ id: "pi_test", amount: 105000 });
    stripeMocks.refundsCreate.mockResolvedValue({ id: "re_test" });
    refreshMocks.ensureAuthEscrowAuthorizationFresh.mockResolvedValue({
      ok: true,
      paymentIntentId: "pi_refreshed",
    });
  });

  it("buyer fault single captures auth_fee only", async () => {
    prepareRpc.mockResolvedValue({
      data: {
        success: true,
        order_kind: "member",
        order_id: "order-buyer",
        payment_intent_id: "pi_test",
        admin_id: "admin-1",
        fault_party: "buyer",
        void_mode: "capture_auth_fee_only",
        capture_cents: 15000,
        escrow_capture_model: "single",
        settlement_required: false,
        refund_cents: 0,
      },
      error: null,
    });

    const result = await runAuthGradingFailVoidSaga({
      orderKind: "member",
      orderId: "order-buyer",
      faultParty: "buyer",
    });

    expect(result).toEqual({ ok: true });
    expect(refreshMocks.ensureAuthEscrowAuthorizationFresh).toHaveBeenCalled();
    const captureCall = stripeMocks.capture.mock.calls[0];
    expect(captureCall?.[0]).toBe("pi_refreshed");
    expect(captureCall?.[1]).toMatchObject({
      amount_to_capture: 15000,
      metadata: expect.objectContaining({ capture_stage: "auth_grading_fail" }),
    });
    expect(captureCall?.[1]).not.toHaveProperty("final_capture");
    expect(captureCall?.[2]).toMatchObject({
      idempotencyKey:
        "auth-grading-fail:capture_auth_fee_only:single:member:order-buyer",
    });
    expect(stripeMocks.cancel).not.toHaveBeenCalled();
    expect(finalizeRpc).toHaveBeenCalledWith(
      expect.objectContaining({
        p_payment_intent_id: "pi_refreshed",
      }),
    );
  });

  it("seller fault single cancels payment intent without refresh", async () => {
    prepareRpc.mockResolvedValue({
      data: {
        success: true,
        order_kind: "member",
        order_id: "order-seller",
        payment_intent_id: "pi_test",
        admin_id: "admin-1",
        fault_party: "seller",
        void_mode: "cancel",
        capture_cents: 0,
        escrow_capture_model: "single",
        settlement_required: true,
        refund_cents: 0,
      },
      error: null,
    });

    const result = await runAuthGradingFailVoidSaga({
      orderKind: "member",
      orderId: "order-seller",
      faultParty: "seller",
    });

    expect(result).toEqual({ ok: true });
    expect(refreshMocks.ensureAuthEscrowAuthorizationFresh).not.toHaveBeenCalled();
    expect(stripeMocks.cancel).toHaveBeenCalled();
    expect(stripeMocks.capture).not.toHaveBeenCalled();
  });

  it("legacy staged uses capture_zero", async () => {
    prepareRpc.mockResolvedValue({
      data: {
        success: true,
        order_kind: "merchant",
        order_id: "order-legacy",
        payment_intent_id: "pi_test",
        admin_id: "admin-1",
        fault_party: "buyer",
        void_mode: "capture_zero",
        capture_cents: 0,
        escrow_capture_model: null,
        settlement_required: false,
        refund_cents: 0,
      },
      error: null,
    });

    const result = await runAuthGradingFailVoidSaga({
      orderKind: "merchant",
      orderId: "order-legacy",
      faultParty: "buyer",
    });

    expect(result).toEqual({ ok: true });
    expect(stripeMocks.capture).toHaveBeenCalledWith(
      "pi_test",
      expect.objectContaining({ amount_to_capture: 0, final_capture: true }),
      expect.any(Object),
    );
    expect(stripeMocks.cancel).not.toHaveBeenCalled();
  });
});
