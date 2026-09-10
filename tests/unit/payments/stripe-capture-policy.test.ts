import { describe, expect, it } from "vitest";
import {
  buildAuthFeeOnlyCaptureParams,
  buildAuthGradingFailIdempotencyKey,
  buildCaptureZeroParams,
  buildGoodsCaptureIdempotencyKey,
  buildGoodsCaptureParams,
} from "@/lib/payments/stripe-capture-policy";

describe("stripe-capture-policy", () => {
  const metadata = { capture_stage: "test" };

  it("single auth_fee_only omits final_capture", () => {
    const params = buildAuthFeeOnlyCaptureParams({
      escrowCaptureModel: "single",
      amountCents: 15000,
      metadata,
    });

    expect(params.amount_to_capture).toBe(15000);
    expect(params).not.toHaveProperty("final_capture");
  });

  it("legacy auth_fee_only sets final_capture", () => {
    const params = buildAuthFeeOnlyCaptureParams({
      escrowCaptureModel: null,
      amountCents: 15000,
      metadata,
    });

    expect(params.final_capture).toBe(true);
  });

  it("single goods capture omits final_capture", () => {
    const params = buildGoodsCaptureParams({
      escrowCaptureModel: "single",
      amountCents: 31000,
      metadata,
    });

    expect(params).not.toHaveProperty("final_capture");
  });

  it("legacy goods capture sets final_capture", () => {
    const params = buildGoodsCaptureParams({
      escrowCaptureModel: null,
      amountCents: 31000,
      metadata,
    });

    expect(params.final_capture).toBe(true);
  });

  it("capture_zero always sets final_capture", () => {
    const params = buildCaptureZeroParams(metadata);
    expect(params).toEqual({
      amount_to_capture: 0,
      final_capture: true,
      metadata,
    });
  });

  it("fail idempotency key includes single segment", () => {
    expect(
      buildAuthGradingFailIdempotencyKey({
        voidMode: "capture_auth_fee_only",
        orderKind: "member",
        orderId: "order-1",
        escrowCaptureModel: "single",
      }),
    ).toBe("auth-grading-fail:capture_auth_fee_only:single:member:order-1");
  });

  it("legacy fail idempotency key excludes single segment", () => {
    expect(
      buildAuthGradingFailIdempotencyKey({
        voidMode: "capture_zero",
        orderKind: "merchant",
        orderId: "order-legacy",
        escrowCaptureModel: null,
      }),
    ).toBe("auth-grading-fail:capture_zero:merchant:order-legacy");
  });

  it("goods capture idempotency uses full stage for single", () => {
    expect(
      buildGoodsCaptureIdempotencyKey({
        escrowCaptureModel: "single",
        orderKind: "member",
        orderId: "order-1",
      }),
    ).toBe("goods-capture:full:member:order-1");
  });
});
