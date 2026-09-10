import type Stripe from "stripe";
import { stripe } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  buildAuthFeeOnlyCaptureParams,
  buildAuthGradingFailIdempotencyKey,
  buildCaptureZeroParams,
  type AuthGradingFailVoidMode,
} from "@/lib/payments/stripe-capture-policy";
import { ensureAuthEscrowAuthorizationFresh } from "@/lib/payments/auth-authorization-refresh";
import { enqueueC2cGradingRefundEmail } from "@/lib/notifications/grading-emails";

export type GradingFaultParty =
  | "buyer"
  | "seller"
  | "platform"
  | "carrier"
  | "inconclusive";

export type CarrierLiabilityParty = "seller" | "platform";

export type AuthGradingFailOrderKind = "member" | "merchant";

export type { AuthGradingFailVoidMode };

export type PrepareAuthGradingFailPayload = {
  success: boolean;
  order_kind: AuthGradingFailOrderKind;
  order_id: string;
  payment_intent_id: string;
  admin_id: string;
  fault_party: GradingFaultParty;
  void_mode?: AuthGradingFailVoidMode;
  escrow_capture_model?: string | null;
  settlement_required?: boolean;
  refund_cents?: number;
  capture_cents?: number;
};

type AuthGradingFailRpcClient = {
  rpc(
    fn: "rpc_prepare_auth_grading_fail",
    args: {
      p_order_kind: AuthGradingFailOrderKind;
      p_order_id: string;
      p_fault_party: GradingFaultParty;
      p_reason: string | null;
      p_carrier_liability_party?: string | null;
    },
  ): Promise<{ data: unknown; error: { message: string } | null }>;
  rpc(
    fn: "rpc_finalize_auth_grading_fail",
    args: {
      p_order_kind: AuthGradingFailOrderKind;
      p_order_id: string;
      p_payment_intent_id: string;
    },
  ): Promise<{ data: unknown; error: { message: string } | null }>;
  rpc(
    fn: "rpc_mark_auth_grading_fail_failed",
    args: {
      p_order_kind: AuthGradingFailOrderKind;
      p_order_id: string;
      p_error: string;
    },
  ): Promise<{ data: unknown; error: { message: string } | null }>;
};

const VALID_FAULT_PARTIES = new Set<GradingFaultParty>([
  "buyer",
  "seller",
  "platform",
  "carrier",
  "inconclusive",
]);

export function isGradingFaultParty(value: string): value is GradingFaultParty {
  return VALID_FAULT_PARTIES.has(value as GradingFaultParty);
}

function gradingRefundOrderKind(orderKind: AuthGradingFailOrderKind): string {
  return orderKind === "member" ? "auth_grading_member" : "auth_grading_merchant";
}

function parseVoidMode(value: unknown): AuthGradingFailVoidMode {
  if (value === "cancel") {
    return "cancel";
  }
  if (value === "capture_auth_fee_only") {
    return "capture_auth_fee_only";
  }
  return "capture_zero";
}

function parsePreparePayload(data: unknown): PrepareAuthGradingFailPayload | null {
  if (!data || typeof data !== "object") {
    return null;
  }

  const payload = data as Record<string, unknown>;
  const orderKind = payload.order_kind;
  const faultParty = payload.fault_party;

  if (orderKind !== "member" && orderKind !== "merchant") {
    return null;
  }

  if (
    typeof faultParty !== "string" ||
    !isGradingFaultParty(faultParty) ||
    typeof payload.order_id !== "string" ||
    typeof payload.payment_intent_id !== "string" ||
    typeof payload.admin_id !== "string"
  ) {
    return null;
  }

  return {
    success: payload.success === true,
    order_kind: orderKind,
    order_id: payload.order_id,
    payment_intent_id: payload.payment_intent_id,
    admin_id: payload.admin_id,
    fault_party: faultParty,
    void_mode: parseVoidMode(payload.void_mode),
    escrow_capture_model:
      typeof payload.escrow_capture_model === "string"
        ? payload.escrow_capture_model
        : null,
    settlement_required: payload.settlement_required === true,
    refund_cents: Number(payload.refund_cents ?? 0),
    capture_cents: Number(payload.capture_cents ?? 0),
  };
}

export async function runAuthGradingFailVoidSaga(input: {
  orderKind: AuthGradingFailOrderKind;
  orderId: string;
  faultParty: GradingFaultParty;
  reason?: string;
  carrierLiabilityParty?: CarrierLiabilityParty;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const rpc = (await createClient()) as unknown as AuthGradingFailRpcClient;
  const serviceRole = createAdminClient() as unknown as AuthGradingFailRpcClient;

  const { data: prepareData, error: prepareError } = await rpc.rpc(
    "rpc_prepare_auth_grading_fail",
    {
      p_order_kind: input.orderKind,
      p_order_id: input.orderId,
      p_fault_party: input.faultParty,
      p_reason: input.reason?.trim() || null,
      p_carrier_liability_party: input.carrierLiabilityParty ?? null,
    },
  );

  if (prepareError) {
    return { ok: false, error: prepareError.message };
  }

  const prepared = parsePreparePayload(prepareData);
  if (!prepared?.success) {
    return { ok: false, error: "鑑定失敗處理準備失敗" };
  }

  const refundCents =
    prepared.settlement_required && prepared.refund_cents
      ? prepared.refund_cents
      : 0;

  let paymentIntentId = prepared.payment_intent_id;

  try {
    if (refundCents > 0) {
      await stripe.refunds.create(
        {
          payment_intent: prepared.payment_intent_id,
          amount: refundCents,
          metadata: {
            order_kind: gradingRefundOrderKind(input.orderKind),
            order_id: input.orderId,
            capture_stage: "auth_grading_fail",
            admin_id: prepared.admin_id,
          },
        },
        {
          idempotencyKey: `auth-grading-fail-refund:${input.orderKind}:${input.orderId}`,
        },
      );
    }

    const voidMode = prepared.void_mode ?? "capture_zero";
    const voidIdempotencyKey = buildAuthGradingFailIdempotencyKey({
      voidMode,
      orderKind: input.orderKind,
      orderId: input.orderId,
      escrowCaptureModel: prepared.escrow_capture_model,
    });

    if (prepared.void_mode === "capture_auth_fee_only") {
      const captureCents = prepared.capture_cents ?? 0;
      if (captureCents <= 0) {
        throw new Error("鑑定費扣款金額異常");
      }

      if (prepared.escrow_capture_model === "single") {
        const existing = await stripe.paymentIntents.retrieve(paymentIntentId);
        const refreshResult = await ensureAuthEscrowAuthorizationFresh({
          orderKind: input.orderKind,
          orderId: input.orderId,
          paymentIntentId,
          buyerTotalCents: existing.amount,
          metadata: {
            capture_stage: "auth_grading_fail",
            order_kind: gradingRefundOrderKind(input.orderKind),
            order_id: input.orderId,
            admin_id: prepared.admin_id,
            escrow_capture_model: "single",
          },
        });

        if (!refreshResult.ok) {
          throw new Error(refreshResult.error);
        }

        paymentIntentId = refreshResult.paymentIntentId;
      }

      await stripe.paymentIntents.capture(
        paymentIntentId,
        buildAuthFeeOnlyCaptureParams({
          escrowCaptureModel: prepared.escrow_capture_model,
          amountCents: captureCents,
          metadata: {
            capture_stage: "auth_grading_fail",
            order_kind: gradingRefundOrderKind(input.orderKind),
            order_id: input.orderId,
            admin_id: prepared.admin_id,
            ...(prepared.escrow_capture_model
              ? { escrow_capture_model: prepared.escrow_capture_model }
              : {}),
          },
        }),
        { idempotencyKey: voidIdempotencyKey },
      );
    } else if (prepared.void_mode === "cancel") {
      await stripe.paymentIntents.cancel(
        paymentIntentId,
        undefined,
        { idempotencyKey: voidIdempotencyKey },
      );
    } else {
      await stripe.paymentIntents.capture(
        paymentIntentId,
        buildCaptureZeroParams({
          capture_stage: "auth_grading_fail",
          order_kind: gradingRefundOrderKind(input.orderKind),
          order_id: input.orderId,
          admin_id: prepared.admin_id,
        }),
        { idempotencyKey: voidIdempotencyKey },
      );
    }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Stripe capture 失敗";

    await serviceRole.rpc("rpc_mark_auth_grading_fail_failed", {
      p_order_kind: input.orderKind,
      p_order_id: input.orderId,
      p_error: message,
    });

    return { ok: false, error: message };
  }

  const { error: finalizeError } = await rpc.rpc(
    "rpc_finalize_auth_grading_fail",
    {
      p_order_kind: input.orderKind,
      p_order_id: input.orderId,
      p_payment_intent_id: paymentIntentId,
    },
  );

  if (finalizeError) {
    await serviceRole.rpc("rpc_mark_auth_grading_fail_failed", {
      p_order_kind: input.orderKind,
      p_order_id: input.orderId,
      p_error: finalizeError.message,
    });
    return { ok: false, error: finalizeError.message };
  }

  if (input.orderKind === "member") {
    await enqueueC2cGradingRefundEmail(input.orderId);
  }

  return { ok: true };
}

export function isAuthGradingFailCapturePaymentIntent(
  paymentIntent: Stripe.PaymentIntent,
): boolean {
  return paymentIntent.metadata?.capture_stage === "auth_grading_fail";
}

export function parseAuthGradingFailWebhookOrderKind(
  metadata: Stripe.Metadata | null | undefined,
): AuthGradingFailOrderKind | null {
  const rawKind = metadata?.order_kind?.trim();
  const orderId = metadata?.order_id?.trim();
  if (!orderId) {
    return null;
  }
  if (rawKind === "auth_grading_member") {
    return "member";
  }
  if (rawKind === "auth_grading_merchant") {
    return "merchant";
  }
  return null;
}

export async function finalizeAuthGradingFailFromWebhook(input: {
  orderKind: AuthGradingFailOrderKind;
  orderId: string;
  paymentIntent: Stripe.PaymentIntent;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const admin = createAdminClient() as unknown as AuthGradingFailRpcClient;

  const { error } = await admin.rpc("rpc_finalize_auth_grading_fail", {
    p_order_kind: input.orderKind,
    p_order_id: input.orderId,
    p_payment_intent_id: input.paymentIntent.id,
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  return { ok: true };
}
