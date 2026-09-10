import type Stripe from "stripe";
import { validateMerchantPaymentIntentAmount } from "@/lib/stripe/merchant-payment-intent-guard";
import type { createAdminClient } from "@/lib/supabase/admin";

type AdminSupabaseClient = ReturnType<typeof createAdminClient>;

type MarkPaidRpcClient = {
  rpc(
    fn: "rpc_mark_merchant_order_paid",
    args: {
      p_order_id: string;
      p_payment_intent_id: string;
      p_amounts: Record<string, string>;
    },
  ): Promise<{ data: unknown; error: { message: string } | null }>;
};

type MerchantCouponRpcClient = {
  rpc(
    fn: "fn_release_merchant_order_coupon",
    args: { p_order_id: string },
  ): Promise<{ data: unknown; error: { message: string } | null }>;
};

type AuthOrderRpcClient = {
  rpc(
    fn: "rpc_mark_auth_order_payment_voided",
    args: {
      p_order_kind: string;
      p_order_id: string;
      p_payment_intent_id: string;
    },
  ): Promise<{ data: unknown; error: { message: string } | null }>;
};

type MemberCouponRpcClient = {
  rpc(
    fn: "fn_release_member_order_coupon",
    args: { p_order_id: string },
  ): Promise<{ data: unknown; error: { message: string } | null }>;
};

type MemberOrderLookupClient = {
  from(table: "member_orders"): {
    select(cols: string): {
      eq(col: string, val: string): {
        maybeSingle(): Promise<{
          data: {
            payment_capture_status: string | null;
            escrow_status: string | null;
          } | null;
          error: { message: string } | null;
        }>;
      };
    };
  };
};

function readMerchantOrderMetadata(
  paymentIntent: Stripe.PaymentIntent,
): { orderId: string; amounts: Record<string, string> } | null {
  const metadata = paymentIntent.metadata ?? {};
  if (metadata.order_kind !== "merchant") {
    return null;
  }

  const orderId = metadata.order_id?.trim();
  if (!orderId) {
    return null;
  }

  const amounts: Record<string, string> = {};
  for (const key of [
    "item_subtotal",
    "shipping_fee",
    "auth_fee",
    "total_amount",
    "buyer_total_amount",
    "platform_subsidy_amount",
    "shipping_method",
  ] as const) {
    const value = metadata[key];
    if (typeof value === "string" && value.trim()) {
      amounts[key] = value.trim();
    }
  }

  return { orderId, amounts };
}

export async function processMerchantPaymentIntentSucceeded(
  admin: AdminSupabaseClient,
  paymentIntent: Stripe.PaymentIntent,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const guard = validateMerchantPaymentIntentAmount(paymentIntent);
  if (!guard.ok) {
    console.error(
      "[stripe/webhook] merchant PI amount guard rejected",
      paymentIntent.id,
      guard.reason,
    );
    return { ok: false, error: guard.reason };
  }

  const parsed = readMerchantOrderMetadata(paymentIntent);
  if (!parsed) {
    return { ok: true };
  }

  const { error } = await (admin as unknown as MarkPaidRpcClient).rpc(
    "rpc_mark_merchant_order_paid",
    {
      p_order_id: parsed.orderId,
      p_payment_intent_id: paymentIntent.id,
      p_amounts: parsed.amounts,
    },
  );

  if (error) {
    console.error(
      "[stripe/webhook] rpc_mark_merchant_order_paid",
      parsed.orderId,
      error.message,
    );
    return { ok: false, error: "order settlement failed" };
  }

  return { ok: true };
}

export async function processMerchantPaymentIntentCanceled(
  admin: AdminSupabaseClient,
  paymentIntent: Stripe.PaymentIntent,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const metadata = paymentIntent.metadata ?? {};
  const orderKind = metadata.order_kind?.trim();
  const orderId = metadata.order_id?.trim();

  if (!orderId) {
    return { ok: true };
  }

  if (orderKind === "member_auth") {
    const { data: memberOrder, error: lookupError } = await (
      admin as unknown as MemberOrderLookupClient
    )
      .from("member_orders")
      .select("payment_capture_status, escrow_status")
      .eq("id", orderId)
      .maybeSingle();

    if (lookupError) {
      console.error(
        "[stripe/webhook] member_auth PI canceled lookup",
        orderId,
        lookupError.message,
      );
      return { ok: false, error: "member auth cancel lookup failed" };
    }

    if (memberOrder?.payment_capture_status === "authorized") {
      const { error } = await (admin as unknown as AuthOrderRpcClient).rpc(
        "rpc_mark_auth_order_payment_voided",
        {
          p_order_kind: "member",
          p_order_id: orderId,
          p_payment_intent_id: paymentIntent.id,
        },
      );

      if (error) {
        console.error(
          "[stripe/webhook] rpc_mark_auth_order_payment_voided member",
          orderId,
          error.message,
        );
        return { ok: false, error: "member auth void sync failed" };
      }

      return { ok: true };
    }

    if (memberOrder?.escrow_status === "payment") {
      const { error } = await (admin as unknown as MemberCouponRpcClient).rpc(
        "fn_release_member_order_coupon",
        { p_order_id: orderId },
      );

      if (error) {
        console.error(
          "[stripe/webhook] fn_release_member_order_coupon",
          orderId,
          error.message,
        );
        return { ok: false, error: "member coupon release failed" };
      }
    }

    return { ok: true };
  }

  if (orderKind === "merchant" && metadata.capture_mode === "manual") {
    const { error } = await (admin as unknown as AuthOrderRpcClient).rpc(
      "rpc_mark_auth_order_payment_voided",
      {
        p_order_kind: "merchant",
        p_order_id: orderId,
        p_payment_intent_id: paymentIntent.id,
      },
    );

    if (error) {
      console.error(
        "[stripe/webhook] rpc_mark_auth_order_payment_voided merchant",
        orderId,
        error.message,
      );
      return { ok: false, error: "merchant auth void sync failed" };
    }

    return { ok: true };
  }

  if (orderKind === "merchant" && metadata.capture_mode !== "manual") {
    const { error } = await (admin as unknown as MerchantCouponRpcClient).rpc(
      "fn_release_merchant_order_coupon",
      { p_order_id: orderId },
    );

    if (error) {
      console.error(
        "[stripe/webhook] fn_release_merchant_order_coupon",
        orderId,
        error.message,
      );
      return { ok: false, error: "merchant coupon release failed" };
    }
  }

  return { ok: true };
}
