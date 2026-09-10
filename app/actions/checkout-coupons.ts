"use server";

import { isSupabaseConfigured } from "@/lib/supabase/env";
import { requireActiveAuthUser } from "@/lib/auth/mutation-guard";
import type { Database } from "@/types/supabase";

type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

export type CheckoutEligibleCoupon = {
  id: string;
  title: string;
  type: Database["public"]["Enums"]["reward_type"];
  rewardValue: Record<string, unknown>;
  eligible: boolean;
  ineligibleReason: string | null;
  previewSubsidy: number;
};

type CheckoutCouponRpcClient = {
  rpc(
    fn: "rpc_list_checkout_eligible_coupons",
    args: {
      p_order_id: string;
      p_shipping_method?: string;
      p_use_auth?: boolean;
    },
  ): Promise<{ data: unknown; error: { message: string } | null }>;
};

function parseEligibleCoupons(data: unknown): CheckoutEligibleCoupon[] {
  if (!Array.isArray(data)) {
    return [];
  }

  return data.flatMap((entry) => {
    if (!entry || typeof entry !== "object") {
      return [];
    }

    const row = entry as Record<string, unknown>;
    if (typeof row.id !== "string") {
      return [];
    }

    return [
      {
        id: row.id,
        title: typeof row.title === "string" ? row.title : "優惠券",
        type: (row.type ?? "discount_coupon") as Database["public"]["Enums"]["reward_type"],
        rewardValue:
          row.reward_value && typeof row.reward_value === "object"
            ? (row.reward_value as Record<string, unknown>)
            : {},
        eligible: row.eligible === true,
        ineligibleReason:
          typeof row.ineligible_reason === "string" ? row.ineligible_reason : null,
        previewSubsidy: Number(row.preview_subsidy ?? 0),
      },
    ];
  });
}

/** 結帳頁列出買家可用優惠券（merchant / member auth；權威金額仍以 prepare RPC 為準）。 */
export async function listCheckoutEligibleCoupons(
  orderId: string,
  options?: { shippingMethod?: string; useAuth?: boolean },
): Promise<ActionResult<CheckoutEligibleCoupon[]>> {
  if (!isSupabaseConfigured()) {
    return { success: false, error: "未登入" };
  }

  const trimmedOrderId = orderId.trim();
  if (!trimmedOrderId) {
    return { success: false, error: "訂單編號無效" };
  }

  try {
    const auth = await requireActiveAuthUser();
    if (!auth.ok) {
      return { success: false, error: auth.error };
    }
    const { supabase } = auth;

    const { data, error } = await (
      supabase as unknown as CheckoutCouponRpcClient
    ).rpc("rpc_list_checkout_eligible_coupons", {
      p_order_id: trimmedOrderId,
      p_shipping_method: options?.shippingMethod,
      p_use_auth: options?.useAuth ?? false,
    });

    if (error) {
      console.error("[listCheckoutEligibleCoupons]", error.message);
      return { success: false, error: error.message };
    }

    return { success: true, data: parseEligibleCoupons(data) };
  } catch (error) {
    console.error("[listCheckoutEligibleCoupons]", error);
    return { success: false, error: "無法載入優惠券" };
  }
}
