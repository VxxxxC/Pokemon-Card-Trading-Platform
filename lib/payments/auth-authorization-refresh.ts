import type Stripe from "stripe";
import { stripe } from "@/lib/stripe";
import { createClient } from "@/lib/supabase/server";

export type AuthEscrowOrderKind = "member" | "merchant";

const AUTH_HOLD_REFRESH_DAYS = 6;

type RefreshRpcClient = {
  rpc(
    fn: "rpc_refresh_auth_escrow_payment_intent",
    args: {
      p_order_kind: AuthEscrowOrderKind;
      p_order_id: string;
      p_payment_intent_id: string;
    },
  ): Promise<{ data: unknown; error: { message: string } | null }>;
};

function stripeOrderKind(orderKind: AuthEscrowOrderKind): string {
  return orderKind === "member" ? "member_auth" : "merchant";
}

function paymentMethodId(
  paymentMethod: Stripe.PaymentIntent["payment_method"],
): string | null {
  if (!paymentMethod) {
    return null;
  }
  if (typeof paymentMethod === "string") {
    return paymentMethod;
  }
  return paymentMethod.id;
}

function shouldRefreshAuthorization(
  paymentIntent: Stripe.PaymentIntent,
  buyerTotalCents: number,
): boolean {
  if (paymentIntent.status !== "requires_capture") {
    return true;
  }

  const capturable = paymentIntent.amount_capturable ?? 0;
  if (capturable < buyerTotalCents) {
    return true;
  }

  const createdAtMs = paymentIntent.created * 1000;
  const ageDays = (Date.now() - createdAtMs) / (1000 * 60 * 60 * 24);
  return ageDays >= AUTH_HOLD_REFRESH_DAYS;
}

export async function ensureAuthEscrowAuthorizationFresh(input: {
  orderKind: AuthEscrowOrderKind;
  orderId: string;
  paymentIntentId: string;
  buyerTotalCents: number;
  metadata: Stripe.MetadataParam;
}): Promise<
  | { ok: true; paymentIntentId: string }
  | { ok: false; error: string }
> {
  const existing = await stripe.paymentIntents.retrieve(input.paymentIntentId);

  if (!shouldRefreshAuthorization(existing, input.buyerTotalCents)) {
    return { ok: true, paymentIntentId: existing.id };
  }

  const pmId = paymentMethodId(existing.payment_method);
  if (!pmId) {
    return {
      ok: false,
      error: "授權已過期或餘額不足，且無法自動重新授權，請聯絡買家重新付款",
    };
  }

  const refreshed = await stripe.paymentIntents.create({
    amount: input.buyerTotalCents,
    currency: "hkd",
    capture_method: "manual",
    payment_method: pmId,
    confirm: true,
    off_session: true,
    metadata: {
      ...input.metadata,
      escrow_capture_model: "single",
      capture_mode: "manual",
      order_kind: stripeOrderKind(input.orderKind),
      order_id: input.orderId,
      refreshed_from_payment_intent_id: existing.id,
    },
  });

  if (refreshed.status !== "requires_capture") {
    return {
      ok: false,
      error: "重新授權失敗，請聯絡買家重新付款",
    };
  }

  if (existing.status !== "canceled") {
    try {
      await stripe.paymentIntents.cancel(existing.id);
    } catch {
      // Best-effort cancel of stale authorization.
    }
  }

  const rpc = (await createClient()) as unknown as RefreshRpcClient;
  const { error: refreshError } = await rpc.rpc(
    "rpc_refresh_auth_escrow_payment_intent",
    {
      p_order_kind: input.orderKind,
      p_order_id: input.orderId,
      p_payment_intent_id: refreshed.id,
    },
  );

  if (refreshError) {
    return { ok: false, error: refreshError.message };
  }

  return { ok: true, paymentIntentId: refreshed.id };
}
