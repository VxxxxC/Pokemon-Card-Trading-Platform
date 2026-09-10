import type Stripe from "stripe";

export type AuthGradingFailVoidMode =
  | "cancel"
  | "capture_zero"
  | "capture_auth_fee_only";

export type GradingCaptureOrderKind = "member" | "merchant";

export function isSingleEscrowCaptureModel(
  escrowCaptureModel: string | null | undefined,
): boolean {
  return escrowCaptureModel === "single";
}

export function buildAuthFeeOnlyCaptureParams(input: {
  escrowCaptureModel: string | null | undefined;
  amountCents: number;
  metadata: Stripe.MetadataParam;
}): Stripe.PaymentIntentCaptureParams {
  const captureParams: Stripe.PaymentIntentCaptureParams = {
    amount_to_capture: input.amountCents,
    metadata: input.metadata,
  };

  if (!isSingleEscrowCaptureModel(input.escrowCaptureModel)) {
    captureParams.final_capture = true;
  }

  return captureParams;
}

export function buildGoodsCaptureParams(input: {
  escrowCaptureModel: string | null | undefined;
  amountCents: number;
  metadata: Stripe.MetadataParam;
}): Stripe.PaymentIntentCaptureParams {
  const captureParams: Stripe.PaymentIntentCaptureParams = {
    amount_to_capture: input.amountCents,
    metadata: input.metadata,
  };

  if (!isSingleEscrowCaptureModel(input.escrowCaptureModel)) {
    captureParams.final_capture = true;
  }

  return captureParams;
}

export function buildCaptureZeroParams(
  metadata: Stripe.MetadataParam,
): Stripe.PaymentIntentCaptureParams {
  return {
    amount_to_capture: 0,
    final_capture: true,
    metadata,
  };
}

export function buildGoodsCaptureIdempotencyKey(input: {
  escrowCaptureModel: string | null | undefined;
  orderKind: GradingCaptureOrderKind;
  orderId: string;
  suffix?: string;
}): string {
  const captureStage = isSingleEscrowCaptureModel(input.escrowCaptureModel)
    ? "full"
    : "goods";
  const base = `goods-capture:${captureStage}:${input.orderKind}:${input.orderId}`;
  return input.suffix ? `${base}:${input.suffix}` : base;
}

export function buildAuthGradingFailIdempotencyKey(input: {
  voidMode: AuthGradingFailVoidMode;
  orderKind: GradingCaptureOrderKind;
  orderId: string;
  escrowCaptureModel: string | null | undefined;
  suffix?: string;
}): string {
  const base =
    input.voidMode === "capture_auth_fee_only" &&
    isSingleEscrowCaptureModel(input.escrowCaptureModel)
      ? `auth-grading-fail:capture_auth_fee_only:single:${input.orderKind}:${input.orderId}`
      : `auth-grading-fail:${input.voidMode}:${input.orderKind}:${input.orderId}`;

  return input.suffix ? `${base}:${input.suffix}` : base;
}

export function resolveGoodsCaptureStage(
  escrowCaptureModel: string | null | undefined,
): "full" | "goods" {
  return isSingleEscrowCaptureModel(escrowCaptureModel) ? "full" : "goods";
}
