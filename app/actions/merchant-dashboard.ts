"use server";

import type {
  MerchantDashboardOverview,
  MerchantDashboardPerformanceStats,
  MerchantDashboardShop,
} from "@/app/lib/dashboard/merchant-types";
import { formatSellerJoinDate } from "@/lib/marketplace/seller-profile";
import { resolveAvatarUrl, resolveOptionalMediaUrl } from "@/lib/profile/avatar";
import { isMerchantPayoutReady } from "@/lib/stripe/payout-ready";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/types/supabase";

type MerchantDashboardResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

type MerchantRoleRow = Pick<Tables<"profiles">, "role">;

type MerchantShopRow = Pick<
  Tables<"merchant_shops">,
  | "merchant_id"
  | "shop_name"
  | "shop_handle"
  | "shop_avatar_path"
  | "top_banner_path"
  | "reputation_tag"
  | "created_at"
  | "completed_trades_count"
  | "rating_score"
>;

type KycRow = Pick<
  Tables<"kyc_records">,
  | "kyc_status"
  | "stripe_account_id"
  | "stripe_charges_enabled"
  | "stripe_payouts_enabled"
>;

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

function formatShopHandle(handle: string | null | undefined): string | null {
  const trimmed = handle?.trim();
  return trimmed ? `@${trimmed}` : null;
}

function mapShopRow(
  shop: MerchantShopRow,
  kyc: KycRow | null,
  activeListingCount: number,
): MerchantDashboardShop {
  return {
    merchantId: shop.merchant_id,
    shopName: shop.shop_name?.trim() || "認證商戶",
    shopHandle: formatShopHandle(shop.shop_handle),
    joinDateLabel: formatSellerJoinDate(shop.created_at ?? ""),
    avatarUrl: resolveAvatarUrl(shop.shop_avatar_path),
    topBannerUrl: resolveOptionalMediaUrl(shop.top_banner_path),
    ratingScore: shop.rating_score,
    reputationTag: shop.reputation_tag,
    completedTradesCount: shop.completed_trades_count ?? 0,
    activeListingCount,
    kycVerified: kyc?.kyc_status === "verified",
    stripeConnected: isMerchantPayoutReady(kyc),
  };
}

function getCurrentMonthBounds(): { startIso: string; endIso: string } {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
  return {
    startIso: start.toISOString(),
    endIso: end.toISOString(),
  };
}

async function fetchActiveMerchantListingCount(
  supabase: SupabaseServerClient,
  merchantId: string,
): Promise<number> {
  const { count, error } = await supabase
    .from("listings")
    .select("id", { count: "exact", head: true })
    .eq("seller_id", merchantId)
    .eq("seller_persona", "merchant")
    .eq("status", "active");

  if (error) {
    console.error("[fetchActiveMerchantListingCount]", error.message);
    throw new Error("無法載入在售商品");
  }

  return count ?? 0;
}

async function fetchMonthlyPerformanceStats(
  supabase: SupabaseServerClient,
  merchantId: string,
): Promise<MerchantDashboardPerformanceStats> {
  const { startIso, endIso } = getCurrentMonthBounds();

  const [ordersResult, revenueResult] = await Promise.all([
    supabase
      .from("merchant_orders")
      .select("id", { count: "exact", head: true })
      .eq("merchant_id", merchantId)
      .gte("created_at", startIso)
      .lte("created_at", endIso),
    supabase
      .from("merchant_orders")
      .select("final_price")
      .eq("merchant_id", merchantId)
      .eq("escrow_status", "completed_and_transferred")
      .gte("created_at", startIso)
      .lte("created_at", endIso),
  ]);

  if (ordersResult.error) {
    console.error("[fetchMonthlyPerformanceStats] orders", ordersResult.error.message);
    return { monthlyOrderCount: 0, monthlyRevenue: 0 };
  }

  if (revenueResult.error) {
    console.error("[fetchMonthlyPerformanceStats] revenue", revenueResult.error.message);
    return { monthlyOrderCount: ordersResult.count ?? 0, monthlyRevenue: 0 };
  }

  const monthlyRevenue = ((revenueResult.data ?? []) as Array<{ final_price: number }>).reduce(
    (sum, row) => sum + Number(row.final_price ?? 0),
    0,
  );

  return {
    monthlyOrderCount: ordersResult.count ?? 0,
    monthlyRevenue,
  };
}

export async function getMerchantDashboardOverview(): Promise<
  MerchantDashboardResult<MerchantDashboardOverview>
> {
  if (!isSupabaseConfigured()) {
    return { success: false, error: "請先登入" };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: "請先登入" };
  }

  try {
    const [profileResult, shopResult, kycResult, activeListingCount, performance] =
      await Promise.all([
        supabase
          .from("profiles")
          .select("role")
          .eq("id", user.id)
          .maybeSingle<MerchantRoleRow>(),
        supabase
          .from("merchant_shops")
          .select(
            "merchant_id, shop_name, shop_handle, shop_avatar_path, top_banner_path, reputation_tag, created_at, completed_trades_count, rating_score",
          )
          .eq("merchant_id", user.id)
          .maybeSingle<MerchantShopRow>(),
        supabase
          .from("kyc_records")
          .select(
            "kyc_status, stripe_account_id, stripe_charges_enabled, stripe_payouts_enabled",
          )
          .eq("merchant_id", user.id)
          .maybeSingle<KycRow>(),
        fetchActiveMerchantListingCount(supabase, user.id),
        fetchMonthlyPerformanceStats(supabase, user.id),
      ]);

    if (profileResult.error || !profileResult.data) {
      return { success: false, error: "無法取得用戶資料" };
    }

    if (profileResult.data.role !== "merchant") {
      return { success: false, error: "無商戶權限" };
    }

    if (shopResult.error) {
      console.error("[getMerchantDashboardOverview] shop", shopResult.error.message);
      return { success: false, error: "無法載入店舖資料" };
    }

    if (!shopResult.data) {
      return { success: false, error: "店舖尚未初始化，請完成商戶認證" };
    }

    if (kycResult.error) {
      console.error("[getMerchantDashboardOverview] kyc", kycResult.error.message);
    }

    return {
      success: true,
      data: {
        shop: mapShopRow(
          shopResult.data,
          kycResult.data ?? null,
          activeListingCount,
        ),
        performance,
      },
    };
  } catch (error) {
    console.error("[getMerchantDashboardOverview]", error);
    return { success: false, error: "無法載入商戶總覽" };
  }
}
