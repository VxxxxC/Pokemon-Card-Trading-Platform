import { beforeEach, describe, expect, it, vi } from "vitest";

const stripeMocks = vi.hoisted(() => ({
  retrieve: vi.fn(),
  capture: vi.fn(),
}));

const refreshMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/stripe", () => ({
  stripe: {
    paymentIntents: {
      retrieve: stripeMocks.retrieve,
      capture: stripeMocks.capture,
    },
  },
}));

vi.mock("@/lib/payments/auth-authorization-refresh", () => ({
  ensureAuthEscrowAuthorizationFresh: refreshMock,
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

import { createClient } from "@/lib/supabase/server";
import { runGoodsCaptureSaga } from "@/lib/payments/goods-capture-saga";

describe("goods-capture-saga", () => {
  const prepareRpc = vi.fn();
  const finalizeRpc = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();

    const rpcClient = {
      rpc: vi.fn((fn: string) => {
        if (fn === "rpc_prepare_goods_capture") {
          return prepareRpc();
        }
        if (fn === "rpc_finalize_goods_capture") {
          return finalizeRpc();
        }
        return Promise.resolve({ data: null, error: null });
      }),
    };

    vi.mocked(createClient).mockResolvedValue(rpcClient as never);

    prepareRpc.mockResolvedValue({
      data: {
        success: true,
        order_kind: "member",
        order_id: "order-1",
        payment_intent_id: "pi_old",
        goods_cents: 31000,
        capture_cents: 31000,
        admin_id: "admin-1",
        escrow_capture_model: "single",
      },
      error: null,
    });

    refreshMock.mockResolvedValue({ ok: true, paymentIntentId: "pi_refreshed" });

    stripeMocks.retrieve.mockResolvedValue({
      status: "requires_capture",
      amount_capturable: 31000,
    });
    stripeMocks.capture.mockResolvedValue({
      id: "pi_refreshed",
      amount_received: 31000,
    });

    finalizeRpc.mockResolvedValue({
      data: { success: true },
      error: null,
    });
  });

  it("single capture refreshes PI before capture", async () => {
    const result = await runGoodsCaptureSaga({
      orderKind: "member",
      orderId: "order-1",
      gradingOptionId: "psa:10",
    });

    expect(result).toEqual({ ok: true });
    expect(refreshMock).toHaveBeenCalledWith(
      expect.objectContaining({
        paymentIntentId: "pi_old",
        buyerTotalCents: 31000,
      }),
    );
    expect(stripeMocks.capture).toHaveBeenCalledWith(
      "pi_refreshed",
      expect.any(Object),
      expect.any(Object),
    );
    expect(finalizeRpc).toHaveBeenCalled();
  });

  it("legacy capture skips refresh", async () => {
    prepareRpc.mockResolvedValue({
      data: {
        success: true,
        order_kind: "member",
        order_id: "order-legacy",
        payment_intent_id: "pi_legacy",
        goods_cents: 10000,
        capture_cents: 10000,
        admin_id: "admin-1",
        escrow_capture_model: null,
      },
      error: null,
    });

    stripeMocks.retrieve.mockResolvedValue({
      status: "requires_capture",
      amount_capturable: 10000,
    });
    stripeMocks.capture.mockResolvedValue({
      id: "pi_legacy",
      amount_received: 10000,
    });

    const result = await runGoodsCaptureSaga({
      orderKind: "member",
      orderId: "order-legacy",
      gradingOptionId: "psa:10",
    });

    expect(result).toEqual({ ok: true });
    expect(refreshMock).not.toHaveBeenCalled();
    expect(stripeMocks.capture).toHaveBeenCalledWith(
      "pi_legacy",
      expect.any(Object),
      expect.any(Object),
    );
  });

  it("returns error when Stripe capture succeeds but finalize RPC fails (C2)", async () => {
    finalizeRpc.mockResolvedValueOnce({
      data: null,
      error: { message: "finalize blocked for test" },
    });

    const result = await runGoodsCaptureSaga({
      orderKind: "member",
      orderId: "order-1",
      gradingOptionId: "psa:10",
    });

    expect(result).toEqual({ ok: false, error: "finalize blocked for test" });
    expect(stripeMocks.capture).toHaveBeenCalled();
    expect(finalizeRpc).toHaveBeenCalled();
  });
});
