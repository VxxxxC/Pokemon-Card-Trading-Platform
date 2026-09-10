import type Stripe from "stripe";
import {
  getGradingOption,
  gradingOptionToFields,
  isAuthPassGradingOptionId,
} from "@/lib/grading/options";
import {
  buildGoodsCaptureIdempotencyKey,
  buildGoodsCaptureParams,
  resolveGoodsCaptureStage,
} from "@/lib/payments/stripe-capture-policy";
import { ensureAuthEscrowAuthorizationFresh } from "@/lib/payments/auth-authorization-refresh";
import { stripe } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type GoodsCaptureOrderKind = "member" | "merchant";

export type PrepareGoodsCapturePayload = {
  success: boolean;
  already_applied?: boolean;
  order_kind: GoodsCaptureOrderKind;
  order_id: string;
  payment_intent_id: string;
  goods_cents: number;
  capture_cents: number;
  admin_id: string;
  notes?: string | null;
  escrow_capture_model?: string | null;
};

type GoodsCaptureRpcClient = {
  rpc(
    fn: "rpc_prepare_goods_capture",
    args: {
      p_order_kind: GoodsCaptureOrderKind;
      p_order_id: string;
      p_notes: string | null;
      p_auth_grading_company: string;
      p_auth_grading_score: string | null;
    },
  ): Promise<{ data: unknown; error: { message: string } | null }>;
  rpc(
    fn: "rpc_finalize_goods_capture",
    args: {
      p_order_kind: GoodsCaptureOrderKind;
      p_order_id: string;
      p_payment_intent_id: string;
      p_captured_amount_cents: number;
      p_admin_id: string | null;
      p_notes: string | null;
      p_auth_grading_company: string | null;
      p_auth_grading_score: string | null;
    },
  ): Promise<{ data: unknown; error: { message: string } | null }>;
};

function parsePreparePayload(data: unknown): PrepareGoodsCapturePayload | null {
  if (!data || typeof data !== "object") {
    return null;
  }

  const payload = data as Record<string, unknown>;
  const orderKind = payload.order_kind;
  if (orderKind !== "member" && orderKind !== "merchant") {
    return null;
  }

  if (
    typeof payload.order_id !== "string" ||
    typeof payload.payment_intent_id !== "string" ||
    typeof payload.admin_id !== "string"
  ) {
    return null;
  }

  const goodsCents = Number(payload.goods_cents ?? 0);
  const captureCents = Number(payload.capture_cents ?? goodsCents);

  return {
    success: payload.success === true,
    already_applied: payload.already_applied === true,
    order_kind: orderKind,
    order_id: payload.order_id,
    payment_intent_id: payload.payment_intent_id,
    goods_cents: goodsCents,
    capture_cents: captureCents,
    admin_id: payload.admin_id,
    notes:
      typeof payload.notes === "string" ? payload.notes : null,
    escrow_capture_model:
      typeof payload.escrow_capture_model === "string"
        ? payload.escrow_capture_model
        : null,
  };
}

function stripeOrderKind(orderKind: GoodsCaptureOrderKind): string {
  return orderKind === "member" ? "member_auth" : "merchant";
}

function resolveAuthPassGradingFields(gradingOptionId: string): {
  company: string;
  score: string | null;
} {
  const fields = gradingOptionToFields(getGradingOption(gradingOptionId));
  return {
    company: fields.grader,
    score: fields.gradeScore,
  };
}

export async function runGoodsCaptureSaga(input: {
  orderKind: GoodsCaptureOrderKind;
  orderId: string;
  gradingOptionId: string;
  notes?: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!isAuthPassGradingOptionId(input.gradingOptionId)) {
    return { ok: false, error: "請選擇鑑定等級" };
  }

  const grading = resolveAuthPassGradingFields(input.gradingOptionId);
  const rpc = (await createClient()) as unknown as GoodsCaptureRpcClient;

  const { data: prepareData, error: prepareError } = await rpc.rpc(
    "rpc_prepare_goods_capture",
    {
      p_order_kind: input.orderKind,
      p_order_id: input.orderId,
      p_notes: input.notes?.trim() || null,
      p_auth_grading_company: grading.company,
      p_auth_grading_score: grading.score,
    },
  );

  if (prepareError) {
    return { ok: false, error: prepareError.message };
  }

  const prepared = parsePreparePayload(prepareData);
  if (!prepared?.success) {
    return { ok: false, error: "鑑定通過扣款準備失敗" };
  }

  if (prepared.already_applied) {
    return { ok: true };
  }

  const captureCents = prepared.capture_cents || prepared.goods_cents;
  if (captureCents <= 0) {
    return { ok: false, error: "扣款金額異常" };
  }

  const captureStage = resolveGoodsCaptureStage(prepared.escrow_capture_model);
  const idempotencyKey = buildGoodsCaptureIdempotencyKey({
    escrowCaptureModel: prepared.escrow_capture_model,
    orderKind: input.orderKind,
    orderId: input.orderId,
  });

  let paymentIntentId = prepared.payment_intent_id;

  if (prepared.escrow_capture_model === "single") {
    const refreshResult = await ensureAuthEscrowAuthorizationFresh({
      orderKind: input.orderKind,
      orderId: input.orderId,
      paymentIntentId,
      buyerTotalCents: captureCents,
      metadata: {
        capture_stage: captureStage,
        admin_id: prepared.admin_id,
        order_kind: stripeOrderKind(input.orderKind),
        order_id: input.orderId,
        auth_grading_company: grading.company,
        ...(grading.score ? { auth_grading_score: grading.score } : {}),
        escrow_capture_model: "single",
      },
    });

    if (!refreshResult.ok) {
      return refreshResult;
    }

    paymentIntentId = refreshResult.paymentIntentId;
  }

  let capturedIntent: Stripe.PaymentIntent;
  try {
    const existingIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
    if (existingIntent.status !== "requires_capture") {
      return { ok: false, error: "付款狀態不允許扣款，請聯絡技術支援" };
    }
    const capturable = existingIntent.amount_capturable ?? 0;
    if (capturable < captureCents) {
      return {
        ok: false,
        error: `可扣款餘額不足（可扣 ${capturable}，需扣 ${captureCents}）。此訂單可能授權已過期，請重新入庫確認或開新單測試。`,
      };
    }

    capturedIntent = await stripe.paymentIntents.capture(
      paymentIntentId,
      buildGoodsCaptureParams({
        escrowCaptureModel: prepared.escrow_capture_model,
        amountCents: captureCents,
        metadata: {
          capture_stage: captureStage,
          admin_id: prepared.admin_id,
          order_kind: stripeOrderKind(input.orderKind),
          order_id: input.orderId,
          auth_grading_company: grading.company,
          ...(grading.score ? { auth_grading_score: grading.score } : {}),
          ...(prepared.escrow_capture_model
            ? { escrow_capture_model: prepared.escrow_capture_model }
            : {}),
        },
      }),
      { idempotencyKey },
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Stripe capture 失敗";
    return { ok: false, error: message };
  }

  const capturedCents = capturedIntent.amount_received;
  if (capturedCents <= 0) {
    return { ok: false, error: "鑑定通過扣款尚未完成" };
  }

  const { error: finalizeError } = await rpc.rpc("rpc_finalize_goods_capture", {
    p_order_kind: input.orderKind,
    p_order_id: input.orderId,
    p_payment_intent_id: paymentIntentId,
    p_captured_amount_cents: capturedCents,
    p_admin_id: prepared.admin_id,
    p_notes: prepared.notes?.trim() || input.notes?.trim() || null,
    p_auth_grading_company: grading.company,
    p_auth_grading_score: grading.score,
  });

  if (finalizeError) {
    return { ok: false, error: finalizeError.message };
  }

  return { ok: true };
}

export function isGoodsCapturePaymentIntent(
  paymentIntent: Stripe.PaymentIntent,
): boolean {
  const stage = paymentIntent.metadata?.capture_stage;
  return stage === "goods" || stage === "full";
}

export function isFullCapturePaymentIntent(
  paymentIntent: Stripe.PaymentIntent,
): boolean {
  return paymentIntent.metadata?.capture_stage === "full";
}

export async function finalizeGoodsCaptureFromWebhook(input: {
  orderKind: GoodsCaptureOrderKind;
  orderId: string;
  paymentIntent: Stripe.PaymentIntent;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const admin = createAdminClient() as unknown as GoodsCaptureRpcClient;
  const adminId = input.paymentIntent.metadata?.admin_id?.trim() || null;
  const authGradingCompany =
    input.paymentIntent.metadata?.auth_grading_company?.trim() || null;
  const authGradingScore =
    input.paymentIntent.metadata?.auth_grading_score?.trim() || null;

  const { error } = await admin.rpc("rpc_finalize_goods_capture", {
    p_order_kind: input.orderKind,
    p_order_id: input.orderId,
    p_payment_intent_id: input.paymentIntent.id,
    p_captured_amount_cents: input.paymentIntent.amount_received,
    p_admin_id: adminId,
    p_notes: null,
    p_auth_grading_company: authGradingCompany,
    p_auth_grading_score: authGradingScore,
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  return { ok: true };
}
