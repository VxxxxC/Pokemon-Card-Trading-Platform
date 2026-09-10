import { beforeEach, describe, expect, it, vi } from "vitest";
import type Stripe from "stripe";

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(),
}));

import { createAdminClient } from "@/lib/supabase/admin";
import {
  finalizeAuthGradingFailFromWebhook,
  isAuthGradingFailCapturePaymentIntent,
  parseAuthGradingFailWebhookOrderKind,
} from "@/lib/payments/auth-grading-fail-void-saga";

function pi(metadata: Record<string, string>): Stripe.PaymentIntent {
  return { id: "pi_test", metadata } as Stripe.PaymentIntent;
}

describe("auth-grading-fail webhook helpers", () => {
  const finalizeRpc = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createAdminClient).mockReturnValue({
      rpc: finalizeRpc,
    } as never);
    finalizeRpc.mockResolvedValue({ data: { success: true }, error: null });
  });

  it("detects auth_grading_fail capture stage only", () => {
    expect(
      isAuthGradingFailCapturePaymentIntent(
        pi({ capture_stage: "auth_grading_fail" }),
      ),
    ).toBe(true);
    expect(
      isAuthGradingFailCapturePaymentIntent(pi({ capture_stage: "goods" })),
    ).toBe(false);
    expect(
      isAuthGradingFailCapturePaymentIntent(pi({ capture_stage: "full" })),
    ).toBe(false);
    expect(
      isAuthGradingFailCapturePaymentIntent(pi({ capture_stage: "auth_fee" })),
    ).toBe(false);
  });

  it("maps auth_grading_member metadata to member", () => {
    expect(
      parseAuthGradingFailWebhookOrderKind({
        order_kind: "auth_grading_member",
        order_id: "order-1",
      }),
    ).toBe("member");
    expect(
      parseAuthGradingFailWebhookOrderKind({
        order_kind: "auth_grading_merchant",
        order_id: "order-2",
      }),
    ).toBe("merchant");
    expect(
      parseAuthGradingFailWebhookOrderKind({
        order_kind: "member_auth",
        order_id: "order-3",
      }),
    ).toBeNull();
  });

  it("finalizeAuthGradingFailFromWebhook calls rpc_finalize_auth_grading_fail", async () => {
    const result = await finalizeAuthGradingFailFromWebhook({
      orderKind: "member",
      orderId: "order-1",
      paymentIntent: pi({
        order_kind: "auth_grading_member",
        order_id: "order-1",
        capture_stage: "auth_grading_fail",
      }),
    });

    expect(result).toEqual({ ok: true });
    expect(finalizeRpc).toHaveBeenCalledWith("rpc_finalize_auth_grading_fail", {
      p_order_kind: "member",
      p_order_id: "order-1",
      p_payment_intent_id: "pi_test",
    });
  });
});
