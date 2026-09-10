"use server";

import { countAdminPendingGradingOrders } from "@/app/actions/admin-grading";
import {
  formatCountWithUnit,
  formatGrowthPct,
  formatHkd,
  formatIntegerCount,
  formatPercentRate,
  countInRange,
  sumInRange,
} from "@/lib/admin-dashboard/format";
import {
  DEFAULT_COMMISSION_RATE,
  formatCommissionPercentLabel,
} from "@/lib/platform/financial-config";
import { formatAuthFeeLabel } from "@/lib/platform/auth-escrow-config";
import { fetchPlatformAuthFeeHkd } from "@/lib/platform/resolve-display-auth-fee";
import {
  getHktMonthRange,
  getHktRollingWindowStartIso,
} from "@/lib/admin-dashboard/hkt-month-bounds";
import { runAdminDashboardHealthProbes } from "@/lib/admin-dashboard/health-probes";
import {
  mapAuthFeeRows,
  mapCommissionRows,
  mapGmvRows,
  mergeRecognizedRows,
  resolveOrderRecognitionAt,
} from "@/lib/admin-dashboard/order-aggregates";
import { buildMonthTrend, ADMIN_DASHBOARD_TREND_MAX_MONTHS } from "@/lib/admin-dashboard/trends";
import type {
  AdminDashboardEcologySegment,
  AdminDashboardHealthResult,
  AdminDashboardMetrics,
  AdminDashboardMetricsResult,
} from "@/lib/admin-dashboard/types";
import { isCurrentUserAdmin } from "@/lib/auth/require-admin";
import { getOptionalAuthUser } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import { getPlatformStripeBalance } from "@/lib/stripe/platform-balance";
import {
  parseCommissionRateFromSettings,
  PLATFORM_FINANCIAL_CONFIG_KEY,
} from "@/lib/platform/financial-config";

const ECOLOGY_COLORS = {
  user: "#D4A574",
  merchant: "#10B981",
  pending: "#F59E0B",
} as const;

async function requireAdmin(): Promise<
  { ok: true; adminId: string } | { ok: false; error: string }
> {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: "未登入" };
  }

  const user = await getOptionalAuthUser();
  if (!user) {
    return { ok: false, error: "請先登入" };
  }

  const supabase = await createClient();
  const isAdmin = await isCurrentUserAdmin(supabase, user.id);
  if (!isAdmin) {
    return { ok: false, error: "無管理員權限" };
  }

  return { ok: true, adminId: user.id };
}

async function fetchConfiguredCommissionRateLabel(): Promise<string | null> {
  if (!isSupabaseConfigured()) {
    return null;
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("platform_settings")
    .select("value")
    .eq("key", PLATFORM_FINANCIAL_CONFIG_KEY)
    .maybeSingle();

  if (error || !data?.value) {
    return null;
  }

  return formatCommissionPercentLabel(parseCommissionRateFromSettings(data.value));
}

async function fetchProfileCount(role?: "member" | "merchant"): Promise<number> {
  const admin = createAdminClient();
  let query = admin.from("profiles").select("id", { count: "exact", head: true });

  if (role) {
    query = query.eq("role", role);
  } else {
    query = query.neq("role", "admin");
  }

  const { count, error } = await query;
  if (error) {
    throw new Error(error.message);
  }

  return count ?? 0;
}

async function fetchPendingKycCount(): Promise<number> {
  const admin = createAdminClient();
  const { count, error } = await admin
    .from("kyc_applications")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending");

  if (error) {
    throw new Error(error.message);
  }

  return count ?? 0;
}

async function fetchBannedUsersCount(): Promise<number> {
  const admin = createAdminClient();
  const nowIso = new Date().toISOString();
  const { data, error } = await admin
    .from("account_sanctions")
    .select("user_id")
    .is("revoked_at", null)
    .eq("type", "ban")
    .or(`ends_at.is.null,ends_at.gt.${nowIso}`);

  if (error) {
    throw new Error(error.message);
  }

  return new Set((data ?? []).map((row) => row.user_id)).size;
}

async function fetchActiveListingCount(): Promise<number> {
  const admin = createAdminClient();
  const { count, error } = await admin
    .from("listings")
    .select("id", { count: "exact", head: true })
    .eq("status", "active");

  if (error) {
    throw new Error(error.message);
  }

  return count ?? 0;
}

async function fetchUnprocessedReportsCount(): Promise<number> {
  const admin = createAdminClient();
  const { count, error } = await admin
    .from("reports")
    .select("id", { count: "exact", head: true })
    .in("status", ["pending", "reviewing"]);

  if (error) {
    throw new Error(error.message);
  }

  return count ?? 0;
}

function buildStripeBalanceMetrics(): AdminDashboardMetrics["stripeBalance"] {
  return {
    availableFormatted: "—",
    pendingFormatted: "—",
    currency: "HKD",
    lastSyncedAt: new Date().toISOString(),
    unavailable: true,
    unavailableReason: null,
  };
}

async function resolveStripeBalanceMetrics(): Promise<
  AdminDashboardMetrics["stripeBalance"]
> {
  const stripeResult = await getPlatformStripeBalance();

  if (!stripeResult.ok) {
    return {
      ...buildStripeBalanceMetrics(),
      unavailableReason: stripeResult.error,
    };
  }

  return {
    availableFormatted: formatHkd(stripeResult.data.available),
    pendingFormatted: formatHkd(stripeResult.data.pending),
    currency: "HKD",
    lastSyncedAt: stripeResult.data.lastSyncedAt,
    unavailable: false,
    unavailableReason: null,
  };
}

function buildEcologySegment(
  key: AdminDashboardEcologySegment["key"],
  role: string,
  count: number,
  denominator: number,
  description: string,
): AdminDashboardEcologySegment {
  const pct = denominator > 0 ? (count / denominator) * 100 : 0;

  return {
    key,
    role,
    count,
    formattedCount: formatIntegerCount(count),
    pct,
    pctStr: `${pct.toFixed(1)}%`,
    color: ECOLOGY_COLORS[key],
    description,
  };
}

export async function getAdminDashboardMetrics(): Promise<AdminDashboardMetricsResult> {
  const guard = await requireAdmin();
  if (!guard.ok) {
    return { success: false, error: guard.error };
  }

  try {
    const admin = createAdminClient();
    const currentMonth = getHktMonthRange(0);
    const previousMonth = getHktMonthRange(-1);
    const rolling90dStartIso = getHktRollingWindowStartIso(90);

    const [
      memberCount,
      merchantCount,
      pendingKycCount,
      totalUsers,
      listingCount,
      unprocessedReportsCount,
      pendingGradingResult,
      completedMerchantOrdersResult,
      completedMemberOrdersResult,
      merchantAuthFeesResult,
      memberAuthFeesResult,
      bannedUsersCount,
      stripeBalance,
    ] = await Promise.all([
      fetchProfileCount("member"),
      fetchProfileCount("merchant"),
      fetchPendingKycCount(),
      fetchProfileCount(),
      fetchActiveListingCount(),
      fetchUnprocessedReportsCount(),
      countAdminPendingGradingOrders(),
      admin
        .from("merchant_orders")
        .select(
          "item_subtotal, final_price, commission_amount, commission_rate_applied, buyer_confirmed_at, updated_at",
        )
        .eq("escrow_status", "completed_and_transferred"),
      admin
        .from("member_orders")
        .select(
          "item_subtotal, final_price, buyer_confirmed_at, updated_at",
        )
        .eq("status", "completed"),
      admin
        .from("merchant_orders")
        .select("auth_fee, auth_fee_captured_at")
        .eq("escrow_status", "completed_and_transferred")
        .not("auth_fee_captured_at", "is", null),
      admin
        .from("member_orders")
        .select("auth_fee, auth_fee_captured_at")
        .eq("status", "completed")
        .not("auth_fee_captured_at", "is", null),
      fetchBannedUsersCount(),
      resolveStripeBalanceMetrics(),
    ]);

    if (!pendingGradingResult.success) {
      return { success: false, error: pendingGradingResult.error };
    }

    if (completedMerchantOrdersResult.error) {
      console.error(
        "[getAdminDashboardMetrics] merchant completed orders",
        completedMerchantOrdersResult.error.message,
      );
      return { success: false, error: "無法載入訂單統計" };
    }

    if (completedMemberOrdersResult.error) {
      console.error(
        "[getAdminDashboardMetrics] member completed orders",
        completedMemberOrdersResult.error.message,
      );
      return { success: false, error: "無法載入訂單統計" };
    }

    if (merchantAuthFeesResult.error) {
      console.error(
        "[getAdminDashboardMetrics] merchant auth fees",
        merchantAuthFeesResult.error.message,
      );
      return { success: false, error: "無法載入鑑定費統計" };
    }

    if (memberAuthFeesResult.error) {
      console.error(
        "[getAdminDashboardMetrics] member auth fees",
        memberAuthFeesResult.error.message,
      );
      return { success: false, error: "無法載入鑑定費統計" };
    }

    const completedMerchantOrders = completedMerchantOrdersResult.data ?? [];
    const completedMemberOrders = completedMemberOrdersResult.data ?? [];
    const merchantAuthFees = merchantAuthFeesResult.data ?? [];
    const memberAuthFees = memberAuthFeesResult.data ?? [];

    const gmvRows = mergeRecognizedRows(
      mapGmvRows(completedMerchantOrders),
      mapGmvRows(completedMemberOrders),
    );

    const commissionRows = mapCommissionRows(completedMerchantOrders);

    const authFeeRows = mergeRecognizedRows(
      mapAuthFeeRows(merchantAuthFees),
      mapAuthFeeRows(memberAuthFees),
    );

    const capturedAuthFeeCount = merchantAuthFees.length + memberAuthFees.length;

    const totalGmv = gmvRows.reduce((sum, row) => sum + row.amount, 0);
    const totalCommission = commissionRows.reduce(
      (sum, row) => sum + row.amount,
      0,
    );
    const totalAppraisal = authFeeRows.reduce((sum, row) => sum + row.amount, 0);

    const currentMonthGmv = sumInRange(
      gmvRows,
      currentMonth.startIso,
      currentMonth.endIso,
    );
    const previousMonthGmv = sumInRange(
      gmvRows,
      previousMonth.startIso,
      previousMonth.endIso,
    );

    const currentMonthCommission = sumInRange(
      commissionRows,
      currentMonth.startIso,
      currentMonth.endIso,
    );
    const previousMonthCommission = sumInRange(
      commissionRows,
      previousMonth.startIso,
      previousMonth.endIso,
    );
    const currentMonthAppraisal = sumInRange(
      authFeeRows,
      currentMonth.startIso,
      currentMonth.endIso,
    );
    const monthlyAppraisalCount = countInRange(
      authFeeRows.map((row) => row.recognizedAt),
      currentMonth.startIso,
      currentMonth.endIso,
    );

    const settledRecognitionAts = mergeRecognizedRows(
      mapGmvRows(completedMerchantOrders),
      mapGmvRows(completedMemberOrders),
    ).map((row) => row.recognizedAt);

    const monthlySettledCount = countInRange(
      settledRecognitionAts,
      currentMonth.startIso,
      currentMonth.endIso,
    );

    const settledOrderCount =
      completedMerchantOrders.length + completedMemberOrders.length;

    const recentCompletedOrders = completedMerchantOrders.filter((order) => {
      const recognizedAt = resolveOrderRecognitionAt(
        order.buyer_confirmed_at,
        order.updated_at,
      );
      if (!recognizedAt) {
        return false;
      }
      return Date.parse(recognizedAt) >= Date.parse(rolling90dStartIso);
    });

    const recentCommissionTotal = recentCompletedOrders.reduce(
      (sum, order) => sum + (order.commission_amount ?? 0),
      0,
    );
    const recentSubtotalTotal = recentCompletedOrders.reduce(
      (sum, order) => sum + (order.item_subtotal ?? 0),
      0,
    );

    const configuredCommissionRateLabel = await fetchConfiguredCommissionRateLabel();

    const commissionRate =
      configuredCommissionRateLabel ??
      (recentSubtotalTotal > 0
        ? formatPercentRate(recentCommissionTotal / recentSubtotalTotal)
        : formatCommissionPercentLabel(DEFAULT_COMMISSION_RATE));

    const configuredAuthFeeLabel = formatAuthFeeLabel(await fetchPlatformAuthFeeHkd());

    const appraisalFeePerCard =
      capturedAuthFeeCount > 0
        ? formatHkd(totalAppraisal / capturedAuthFeeCount)
        : configuredAuthFeeLabel;

    const memberExclusiveCount = Math.max(0, memberCount - pendingKycCount);
    const ecologyDenominator =
      memberExclusiveCount + merchantCount + pendingKycCount;
    const distribution: AdminDashboardEcologySegment[] = [
      buildEcologySegment(
        "user",
        "一般會員",
        memberExclusiveCount,
        ecologyDenominator,
        "個人買家與卡牌玩家",
      ),
      buildEcologySegment(
        "merchant",
        "認證商戶",
        merchantCount,
        ecologyDenominator,
        "已通過企業或實體店驗證",
      ),
      buildEcologySegment(
        "pending",
        "待審核商戶",
        pendingKycCount,
        ecologyDenominator,
        "等待管理員人工資質審查",
      ),
    ];

    const data: AdminDashboardMetrics = {
      userEcology: {
        totalUsers,
        totalUsersFormatted: formatIntegerCount(totalUsers),
        bannedUsers: bannedUsersCount,
        activeRatio: null,
        activeCount: null,
        distribution,
      },
      marketVolume: {
        totalGmv: formatHkd(totalGmv),
        monthlyGmv: formatHkd(currentMonthGmv),
        settledCount: formatCountWithUnit(settledOrderCount, "筆"),
        monthlySettledCount: formatCountWithUnit(monthlySettledCount, "筆"),
        listingCount: formatCountWithUnit(listingCount, "件"),
        growthRate: formatGrowthPct(currentMonthGmv, previousMonthGmv),
      },
      revenues: {
        totalCommission: formatHkd(totalCommission),
        monthlyCommission: formatHkd(currentMonthCommission),
        commissionRate,
        commissionGrowth: formatGrowthPct(
          currentMonthCommission,
          previousMonthCommission,
        ),
        appraisalTotal: formatHkd(totalAppraisal),
        monthlyAppraisal: formatHkd(currentMonthAppraisal),
        monthlyNetRevenue: formatHkd(
          currentMonthCommission + currentMonthAppraisal,
        ),
        totalNetRevenue: formatHkd(totalCommission + totalAppraisal),
        monthlyAppraisalCount: formatCountWithUnit(monthlyAppraisalCount, "筆交易"),
        appraisalFeePerCard,
        totalAppraisals: formatCountWithUnit(capturedAuthFeeCount, "筆交易"),
      },
      stripeBalance,
      alerts: {
        unprocessedReports: unprocessedReportsCount,
        pendingKyc: pendingKycCount,
        pendingGrading: pendingGradingResult.data,
      },
      syncedAt: new Date().toISOString(),
      trends: {
        netRevenue: buildMonthTrend(
          [...commissionRows, ...authFeeRows],
          ADMIN_DASHBOARD_TREND_MAX_MONTHS,
        ),
        gmv: buildMonthTrend(gmvRows, ADMIN_DASHBOARD_TREND_MAX_MONTHS),
      },
    };

    return { success: true, data };
  } catch (error) {
    console.error("[getAdminDashboardMetrics]", error);
    return { success: false, error: "無法載入後台數據總覽" };
  }
}

export async function getAdminSystemHealthStatus(): Promise<AdminDashboardHealthResult> {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return { success: false, error: auth.error };
  }

  try {
    const services = await runAdminDashboardHealthProbes();
    return { success: true, data: { services } };
  } catch (error) {
    console.error("[getAdminSystemHealthStatus]", error);
    return { success: false, error: "無法檢測系統服務狀態" };
  }
}
