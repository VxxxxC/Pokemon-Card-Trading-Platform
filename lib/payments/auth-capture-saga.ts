import type Stripe from "stripe";
import { stripe } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type AuthCaptureOrderKind = "member" | "merchant";

export type PrepareAuthFeeCapturePayload = {
  success: boolean;
  already_applied?: boolean;
  order_kind: AuthCaptureOrderKind;
  order_id: string;
  payment_intent_id: string;
  auth_fee_cents: number;
  admin_id: string;
};

type AuthCaptureRpcClient = {
  rpc(
    fn: "rpc_prepare_auth_fee_capture",
    args: { p_order_kind: AuthCaptureOrderKind; p_order_id: string },
  ): Promise<{ data: unknown; error: { message: string } | null }>;
  rpc(
    fn: "rpc_finalize_auth_fee_capture",
    args: {
      p_order_kind: AuthCaptureOrderKind;
      p_order_id: string;
      p_payment_intent_id: string;
      p_captured_amount_cents: number;
      p_admin_id: string | null;
    },
  ): Promise<{ data: unknown; error: { message: string } | null }>;
};

function parsePreparePayload(data: unknown): PrepareAuthFeeCapturePayload | null {
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

  return {
    success: payload.success === true,
    already_applied: payload.already_applied === true,
    order_kind: orderKind,
    order_id: payload.order_id,
    payment_intent_id: payload.payment_intent_id,
    auth_fee_cents: Number(payload.auth_fee_cents ?? 0),
    admin_id: payload.admin_id,
  };
}

export async function runAuthFeeCaptureSaga(input: {
  orderKind: AuthCaptureOrderKind;
  orderId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const rpc = (await createClient()) as unknown as AuthCaptureRpcClient;

  const { data: prepareData, error: prepareError } = await rpc.rpc(
    "rpc_prepare_auth_fee_capture",
    {
      p_order_kind: input.orderKind,
      p_order_id: input.orderId,
    },
  );

  if (prepareError) {
    return { ok: false, error: prepareError.message };
  }

  const prepared = parsePreparePayload(prepareData);
  if (!prepared?.success) {
    return { ok: false, error: "入庫扣款準備失敗" };
  }

  if (prepared.already_applied) {
    return { ok: true };
  }

  if (prepared.auth_fee_cents <= 0) {
    return { ok: false, error: "鑑定費金額異常" };
  }

  const idempotencyKey = `auth-fee-capture:${input.orderKind}:${input.orderId}`;

  let capturedIntent: Stripe.PaymentIntent;
  try {
    capturedIntent = await stripe.paymentIntents.capture(
      prepared.payment_intent_id,
      {
        amount_to_capture: prepared.auth_fee_cents,
        final_capture: false,
        metadata: {
          capture_stage: "auth_fee",
          admin_id: prepared.admin_id,
          order_kind: input.orderKind,
          order_id: input.orderId,
        },
      },
      { idempotencyKey },
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Stripe capture 失敗";
    return { ok: false, error: message };
  }

  const capturedCents = capturedIntent.amount_received;
  if (capturedCents <= 0) {
    return { ok: false, error: "入庫扣款尚未完成" };
  }

  const { error: finalizeError } = await rpc.rpc(
    "rpc_finalize_auth_fee_capture",
    {
      p_order_kind: input.orderKind,
      p_order_id: input.orderId,
      p_payment_intent_id: prepared.payment_intent_id,
      p_captured_amount_cents: capturedCents,
      p_admin_id: prepared.admin_id,
    },
  );

  if (finalizeError) {
    return { ok: false, error: finalizeError.message };
  }

  return { ok: true };
}

export function isAuthFeeCapturePaymentIntent(
  paymentIntent: Stripe.PaymentIntent,
): boolean {
  const metadata = paymentIntent.metadata ?? {};
  if (metadata.capture_stage === "auth_fee") {
    return true;
  }

  const authFeeRaw = metadata.auth_fee;
  if (typeof authFeeRaw === "string" && authFeeRaw.trim()) {
    const authFeeCents = Math.round(parseFloat(authFeeRaw) * 100);
    if (
      Number.isFinite(authFeeCents) &&
      authFeeCents > 0 &&
      paymentIntent.amount_received === authFeeCents
    ) {
      return true;
    }
  }

  return (
    paymentIntent.amount_received > 0 &&
    paymentIntent.amount_received < paymentIntent.amount
  );
}

export async function finalizeAuthFeeCaptureFromWebhook(input: {
  orderKind: AuthCaptureOrderKind;
  orderId: string;
  paymentIntent: Stripe.PaymentIntent;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const admin = createAdminClient() as unknown as AuthCaptureRpcClient;
  const adminId = input.paymentIntent.metadata?.admin_id?.trim() || null;

  const { error } = await admin.rpc("rpc_finalize_auth_fee_capture", {
    p_order_kind: input.orderKind,
    p_order_id: input.orderId,
    p_payment_intent_id: input.paymentIntent.id,
    p_captured_amount_cents: input.paymentIntent.amount_received,
    p_admin_id: adminId,
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  return { ok: true };
}
