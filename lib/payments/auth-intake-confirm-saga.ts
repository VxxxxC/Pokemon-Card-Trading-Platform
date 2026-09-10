import type Stripe from "stripe";
import { stripe } from "@/lib/stripe";
import { ensureAuthEscrowAuthorizationFresh } from "@/lib/payments/auth-authorization-refresh";
import { createClient } from "@/lib/supabase/server";

export type AuthIntakeConfirmOrderKind = "member" | "merchant";

export type PrepareAuthIntakeConfirmPayload = {
  success: boolean;
  already_applied?: boolean;
  order_kind: AuthIntakeConfirmOrderKind;
  order_id: string;
  payment_intent_id: string;
  buyer_total_cents: number;
  admin_id: string;
  escrow_capture_model?: string | null;
};

type AuthIntakeConfirmRpcClient = {
  rpc(
    fn: "rpc_prepare_auth_intake_confirm",
    args: { p_order_kind: AuthIntakeConfirmOrderKind; p_order_id: string },
  ): Promise<{ data: unknown; error: { message: string } | null }>;
  rpc(
    fn: "rpc_finalize_auth_intake_confirm",
    args: {
      p_order_kind: AuthIntakeConfirmOrderKind;
      p_order_id: string;
      p_payment_intent_id: string;
      p_admin_id: string | null;
    },
  ): Promise<{ data: unknown; error: { message: string } | null }>;
};

function parsePreparePayload(
  data: unknown,
): PrepareAuthIntakeConfirmPayload | null {
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
    buyer_total_cents: Number(payload.buyer_total_cents ?? 0),
    admin_id: payload.admin_id,
    escrow_capture_model:
      typeof payload.escrow_capture_model === "string"
        ? payload.escrow_capture_model
        : null,
  };
}

function stripeOrderKind(orderKind: AuthIntakeConfirmOrderKind): string {
  return orderKind === "member" ? "member_auth" : "merchant";
}

export async function runAuthIntakeConfirmSaga(input: {
  orderKind: AuthIntakeConfirmOrderKind;
  orderId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const rpc = (await createClient()) as unknown as AuthIntakeConfirmRpcClient;

  const { data: prepareData, error: prepareError } = await rpc.rpc(
    "rpc_prepare_auth_intake_confirm",
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
    return { ok: false, error: "入庫確認準備失敗" };
  }

  if (prepared.already_applied) {
    return { ok: true };
  }

  if (prepared.buyer_total_cents <= 0) {
    return { ok: false, error: "買家實付金額異常" };
  }

  let paymentIntentId = prepared.payment_intent_id;
  let paymentIntentMetadata: Stripe.MetadataParam = {
    order_kind: stripeOrderKind(input.orderKind),
    order_id: input.orderId,
    escrow_capture_model: "single",
    capture_mode: "manual",
  };

  try {
    const existing = await stripe.paymentIntents.retrieve(paymentIntentId);
    paymentIntentMetadata = {
      ...existing.metadata,
      ...paymentIntentMetadata,
    };
  } catch {
    return { ok: false, error: "無法讀取付款授權狀態" };
  }

  const refreshResult = await ensureAuthEscrowAuthorizationFresh({
    orderKind: input.orderKind,
    orderId: input.orderId,
    paymentIntentId,
    buyerTotalCents: prepared.buyer_total_cents,
    metadata: paymentIntentMetadata,
  });

  if (!refreshResult.ok) {
    return refreshResult;
  }

  paymentIntentId = refreshResult.paymentIntentId;

  const { error: finalizeError } = await rpc.rpc(
    "rpc_finalize_auth_intake_confirm",
    {
      p_order_kind: input.orderKind,
      p_order_id: input.orderId,
      p_payment_intent_id: paymentIntentId,
      p_admin_id: prepared.admin_id,
    },
  );

  if (finalizeError) {
    return { ok: false, error: finalizeError.message };
  }

  return { ok: true };
}
