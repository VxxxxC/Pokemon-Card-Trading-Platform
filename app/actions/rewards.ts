"use server";

import { guardMemberPersonaPersonalFeatures } from "@/lib/auth/guard-member-persona-server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import {
  parseCheckInProgramMemberView,
  parseCompletionGranted,
} from "@/lib/admin-check-in-program/parse-check-in-program";
import type { CheckInProgramMemberView } from "@/lib/admin-check-in-program/types";
import {
  parseRewardGrantRows,
  type UnacknowledgedRewardGrant,
} from "@/lib/constants/rewards";
import {
  groupUserRewardCoupons,
  parseRewardCouponCenter,
  parseUserRewardCouponRows,
  type RewardCouponCenterView,
} from "@/lib/rewards/mapUserRewardCoupon";
import { parsePointsRedemptionCatalogList } from "@/lib/rewards/mapPointsRedemptionCatalog";
import type { PointsRedemptionCatalogView } from "@/lib/admin-rewards/types";
import {
  isCheckedInTodayHk,
  resolveEffectiveCheckInStreak,
} from "@/lib/rewards/check-in-streak";
import { createClient } from "@/lib/supabase/server";
import { requireActiveAuthUser } from "@/lib/auth/mutation-guard";
import { enqueuePointsRedemptionGrantedEmail } from "@/lib/notifications/rewards-emails";

type GamificationStatsResult =
  | {
      success: true;
      data: {
        pointsBalance: number;
        currentStreak: number;
        longestStreak: number;
        lastCheckIn: string | null;
        checkedInToday: boolean;
      };
    }
  | { success: false; error: string };

type DailyCheckInResult =
  | {
      success: true;
      data: {
        pointsEarned: number;
        pointsBalance: number;
        currentStreak: number;
        longestStreak: number;
        cycleDay: number;
        newlyGranted: UnacknowledgedRewardGrant[];
        completionGranted: {
          type: string;
          title: string;
          pointsGranted: number | null;
        } | null;
      };
    }
  | { success: false; error: string };

type CheckInProgramResult =
  | { success: true; data: CheckInProgramMemberView }
  | { success: false; error: string };

type UnacknowledgedRewardsResult =
  | { success: true; data: UnacknowledgedRewardGrant[] }
  | { success: false; error: string };

type AcknowledgeRewardsResult =
  | { success: true; updated: number }
  | { success: false; error: string };

type GrantPointsFromTemplateResult =
  | {
      success: true;
      data: {
        pointsGranted: number;
        pointsBalance: number;
        templateId: string;
      };
    }
  | { success: false; error: string };

type UserRewardCouponsResult =
  | { success: true; data: RewardCouponCenterView }
  | { success: false; error: string };

const EMPTY_COUPON_CENTER: RewardCouponCenterView = {
  wallet: { redeemable: [], redeemed: [], expired: [] },
  locked: [],
};

const COUPON_TEMPLATE_TYPES = new Set(["discount_coupon", "free_shipping"]);

function isCouponRpcUnavailable(error: { message: string }): boolean {
  const msg = error.message.toLowerCase();
  return (
    (msg.includes("get_reward_coupon_center") ||
      msg.includes("get_user_reward_coupons")) &&
    (msg.includes("does not exist") || msg.includes("could not find"))
  );
}

export async function getGamificationStats(): Promise<GamificationStatsResult> {
  if (!isSupabaseConfigured()) {
    return { success: false, error: "未登入" };
  }

  const personaGuard = await guardMemberPersonaPersonalFeatures();
  if (!personaGuard.allowed) {
    return { success: false, error: personaGuard.error };
  }

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: "請先登入" };
    }

    const { data, error } = await (
      supabase as unknown as {
        rpc: (fn: "get_gamification_stats_for_me") => Promise<{
          data: unknown;
          error: { message: string } | null;
        }>;
      }
    ).rpc("get_gamification_stats_for_me");

    if (error) {
      console.error("[getGamificationStats]", error.message);
      return { success: false, error: "無法載入積分資料" };
    }

    const payload = data as Record<string, unknown> | null;
    const lastCheckIn =
      typeof payload?.last_check_in === "string" ? payload.last_check_in : null;
    const storedStreak = Number(payload?.current_streak ?? 0);
    const checkedInToday = isCheckedInTodayHk(lastCheckIn);
    const effectiveStreak = resolveEffectiveCheckInStreak({
      currentStreak: storedStreak,
      lastCheckIn,
      checkedInToday,
    });

    return {
      success: true,
      data: {
        pointsBalance: Number(payload?.points_balance ?? 0),
        currentStreak: effectiveStreak,
        longestStreak: Number(payload?.longest_streak ?? 0),
        lastCheckIn,
        checkedInToday,
      },
    };
  } catch (error) {
    console.error("[getGamificationStats]", error);
    return { success: false, error: "無法載入積分資料" };
  }
}

export async function executeDailyCheckIn(): Promise<DailyCheckInResult> {
  const personaGuard = await guardMemberPersonaPersonalFeatures();
  if (!personaGuard.allowed) {
    return { success: false, error: personaGuard.error };
  }

  try {
    const auth = await requireActiveAuthUser();
    if (!auth.ok) {
      return { success: false, error: auth.error };
    }
    const { supabase } = auth;

    const { data, error } = await (
      supabase as unknown as {
        rpc: (fn: "execute_daily_check_in") => Promise<{
          data: unknown;
          error: { message: string } | null;
        }>;
      }
    ).rpc("execute_daily_check_in");

    if (error) {
      return { success: false, error: error.message };
    }

    const payload = data as Record<string, unknown> | null;
    if (!payload?.success) {
      return { success: false, error: "簽到失敗" };
    }

    return {
      success: true,
      data: {
        pointsEarned: Number(payload.points_earned ?? 0),
        pointsBalance: Number(payload.points_balance ?? 0),
        currentStreak: Number(payload.current_streak ?? 0),
        longestStreak: Number(payload.longest_streak ?? 0),
        cycleDay: Number(payload.cycle_day ?? 1),
        newlyGranted: parseRewardGrantRows(payload.newly_granted),
        completionGranted: parseCompletionGranted(payload.completion_granted),
      },
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "簽到時發生錯誤";
    console.error("[executeDailyCheckIn]", error);
    return { success: false, error: message };
  }
}

export async function getCheckInProgram(): Promise<CheckInProgramResult> {
  if (!isSupabaseConfigured()) {
    return {
      success: true,
      data: parseCheckInProgramMemberView(null),
    };
  }

  const personaGuard = await guardMemberPersonaPersonalFeatures();
  if (!personaGuard.allowed) {
    return { success: false, error: personaGuard.error };
  }

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: "請先登入" };
    }

    const { data, error } = await (
      supabase as unknown as {
        rpc: (fn: "get_check_in_program_for_member") => Promise<{
          data: unknown;
          error: { message: string } | null;
        }>;
      }
    ).rpc("get_check_in_program_for_member");

    if (error) {
      console.error("[getCheckInProgram]", error.message);
      return {
        success: true,
        data: parseCheckInProgramMemberView(null),
      };
    }

    return {
      success: true,
      data: parseCheckInProgramMemberView(data),
    };
  } catch (error) {
    console.error("[getCheckInProgram]", error);
    return {
      success: true,
      data: parseCheckInProgramMemberView(null),
    };
  }
}

export async function getUnacknowledgedRewardGrants(): Promise<UnacknowledgedRewardsResult> {
  if (!isSupabaseConfigured()) {
    return { success: true, data: [] };
  }

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { success: true, data: [] };
    }

    const { data, error } = await (
      supabase as unknown as {
        rpc: (fn: "get_unacknowledged_reward_grants") => Promise<{
          data: unknown;
          error: { message: string } | null;
        }>;
      }
    ).rpc("get_unacknowledged_reward_grants");

    if (error) {
      console.error("[getUnacknowledgedRewardGrants]", error.message);
      return { success: false, error: "無法載入獎勵通知" };
    }

    return {
      success: true,
      data: parseRewardGrantRows(data),
    };
  } catch (error) {
    console.error("[getUnacknowledgedRewardGrants]", error);
    return { success: false, error: "無法載入獎勵通知" };
  }
}

export async function acknowledgeRewardGrants(
  userRewardIds: string[],
): Promise<AcknowledgeRewardsResult> {
  const ids = userRewardIds.filter(Boolean);
  if (ids.length === 0) {
    return { success: true, updated: 0 };
  }

  try {
    const auth = await requireActiveAuthUser();
    if (!auth.ok) {
      return { success: false, error: auth.error };
    }
    const { supabase } = auth;

    const { data, error } = await (
      supabase as unknown as {
        rpc: (
          fn: "acknowledge_reward_grants",
          args: { p_user_reward_ids: string[] },
        ) => Promise<{
          data: unknown;
          error: { message: string } | null;
        }>;
      }
    ).rpc("acknowledge_reward_grants", { p_user_reward_ids: ids });

    if (error) {
      return { success: false, error: error.message };
    }

    const payload = data as Record<string, unknown> | null;
    return {
      success: true,
      updated: Number(payload?.updated ?? 0),
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "確認獎勵時發生錯誤";
    console.error("[acknowledgeRewardGrants]", error);
    return { success: false, error: message };
  }
}

export async function grantPointsFromTemplate(
  templateId: string,
): Promise<GrantPointsFromTemplateResult> {
  const trimmed = templateId.trim();
  if (!trimmed) {
    return { success: false, error: "無效的獎勵模板" };
  }

  try {
    const auth = await requireActiveAuthUser();
    if (!auth.ok) {
      return { success: false, error: auth.error };
    }
    const { user, supabase } = auth;

    const { data, error } = await (
      supabase as unknown as {
        rpc: (
          fn: "fn_grant_points_from_template",
          args: { p_user_id: string; p_template_id: string },
        ) => Promise<{
          data: unknown;
          error: { message: string } | null;
        }>;
      }
    ).rpc("fn_grant_points_from_template", {
      p_user_id: user.id,
      p_template_id: trimmed,
    });

    if (error) {
      return { success: false, error: error.message };
    }

    const payload = data as Record<string, unknown> | null;
    if (!payload?.success) {
      return { success: false, error: "領取積分失敗" };
    }

    return {
      success: true,
      data: {
        pointsGranted: Number(payload.points_granted ?? 0),
        pointsBalance: Number(payload.points_balance ?? 0),
        templateId: String(payload.template_id ?? trimmed),
      },
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "領取積分時發生錯誤";
    console.error("[grantPointsFromTemplate]", error);
    return { success: false, error: message };
  }
}

/** Fire-and-forget: evaluate auto-grant templates (e.g. profile_complete HK$2 coupon). */
export async function syncAutoGrantRewards(): Promise<void> {
  if (!isSupabaseConfigured()) {
    return;
  }

  try {
    const auth = await requireActiveAuthUser();
    if (!auth.ok) {
      return;
    }
    const { supabase } = auth;

    await (
      supabase as unknown as {
        rpc: (fn: "run_auto_grant_rewards_for_me") => Promise<{
          error: { message: string } | null;
        }>;
      }
    ).rpc("run_auto_grant_rewards_for_me");
  } catch (error) {
    console.error("[syncAutoGrantRewards]", error);
  }
}

export async function getUserRewardCoupons(): Promise<UserRewardCouponsResult> {
  if (!isSupabaseConfigured()) {
    return { success: true, data: EMPTY_COUPON_CENTER };
  }

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: "請先登入" };
    }

    const { data, error } = await (
      supabase as unknown as {
        rpc: (
          fn: "get_reward_coupon_center",
          args: { p_user_id: string },
        ) => Promise<{
          data: unknown;
          error: { message: string } | null;
        }>;
      }
    ).rpc("get_reward_coupon_center", { p_user_id: user.id });

    if (error) {
      if (isCouponRpcUnavailable(error)) {
        return getUserRewardCouponsViaTable(supabase, user.id);
      }
      console.error("[getUserRewardCoupons]", error.message);
      return { success: false, error: "無法載入折價券" };
    }

    return {
      success: true,
      data: parseRewardCouponCenter(data),
    };
  } catch (error) {
    console.error("[getUserRewardCoupons]", error);
    return { success: false, error: "無法載入折價券" };
  }
}

async function getUserRewardCouponsViaTable(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
): Promise<UserRewardCouponsResult> {
  await (
    supabase as unknown as {
      rpc: (fn: "run_auto_grant_rewards_for_me") => Promise<unknown>;
    }
  ).rpc("run_auto_grant_rewards_for_me");

  const { data, error } = await supabase
    .from("user_rewards")
    .select(
      `
      id,
      is_used,
      calculated_expiry,
      used_at,
      template:reward_templates (
        title,
        description,
        type,
        reward_value
      )
    `,
    )
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[getUserRewardCouponsViaTable]", error.message);
    return { success: false, error: "無法載入折價券" };
  }

  type CouponRewardRow = {
    id: string;
    is_used: boolean | null;
    calculated_expiry: string | null;
    used_at: string | null;
    template:
      | {
          title: string;
          description: string | null;
          type: string;
          reward_value: unknown;
        }
      | {
          title: string;
          description: string | null;
          type: string;
          reward_value: unknown;
        }[]
      | null;
  };

  const couponRows = parseUserRewardCouponRows(
    ((data ?? []) as CouponRewardRow[])
      .map((row) => {
        const template = Array.isArray(row.template)
          ? (row.template[0] ?? null)
          : row.template;
        return { ...row, template };
      })
      .filter((row) => {
        const templateType = row.template?.type;
        return templateType != null && COUPON_TEMPLATE_TYPES.has(templateType);
      }),
  );

  return {
    success: true,
    data: {
      wallet: groupUserRewardCoupons(couponRows),
      locked: [],
    },
  };
}

type PointsRedemptionCatalogResult =
  | { success: true; data: PointsRedemptionCatalogView[] }
  | { success: false; error: string };

type RedeemPointsCatalogResult =
  | {
      success: true;
      data: {
        pointsRedeemed: number;
        pointsBalance: number;
        userRewardId: string;
      };
    }
  | { success: false; error: string };

export async function listPointsRedemptionCatalog(): Promise<PointsRedemptionCatalogResult> {
  if (!isSupabaseConfigured()) {
    return { success: false, error: "未登入" };
  }

  const personaGuard = await guardMemberPersonaPersonalFeatures();
  if (!personaGuard.allowed) {
    return { success: false, error: personaGuard.error };
  }

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: "請先登入" };
    }

    const { data, error } = await (
      supabase as unknown as {
        rpc: (fn: "rpc_list_points_redemption_catalog") => Promise<{
          data: unknown;
          error: { message: string } | null;
        }>;
      }
    ).rpc("rpc_list_points_redemption_catalog");

    if (error) {
      console.error("[listPointsRedemptionCatalog]", error.message);
      return { success: false, error: error.message || "無法載入積分商城" };
    }

    return {
      success: true,
      data: parsePointsRedemptionCatalogList(data),
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "無法載入積分商城";
    console.error("[listPointsRedemptionCatalog]", error);
    return { success: false, error: message };
  }
}

export async function redeemPointsCatalogItem(
  catalogId: string,
): Promise<RedeemPointsCatalogResult> {
  if (!isSupabaseConfigured()) {
    return { success: false, error: "未登入" };
  }

  const personaGuard = await guardMemberPersonaPersonalFeatures();
  if (!personaGuard.allowed) {
    return { success: false, error: personaGuard.error };
  }

  const trimmedId = catalogId.trim();
  if (!trimmedId) {
    return { success: false, error: "商品編號無效" };
  }

  try {
    const auth = await requireActiveAuthUser();
    if (!auth.ok) {
      return { success: false, error: auth.error };
    }
    const { user, supabase } = auth;

    const { data, error } = await (
      supabase as unknown as {
        rpc: (
          fn: "rpc_redeem_points_catalog_item",
          args: { p_catalog_id: string },
        ) => Promise<{
          data: unknown;
          error: { message: string } | null;
        }>;
      }
    ).rpc("rpc_redeem_points_catalog_item", { p_catalog_id: trimmedId });

    if (error) {
      console.error("[redeemPointsCatalogItem]", error.message);
      return { success: false, error: error.message || "兌換失敗" };
    }

    const payload = data as Record<string, unknown> | null;
    if (!payload?.success) {
      return { success: false, error: "兌換失敗" };
    }

    await enqueuePointsRedemptionGrantedEmail({
      userId: user.id,
      catalogId: trimmedId,
      userRewardId: String(payload.user_reward_id ?? ""),
      pointsRedeemed: Number(payload.points_redeemed ?? 0),
    });

    return {
      success: true,
      data: {
        pointsRedeemed: Number(payload.points_redeemed ?? 0),
        pointsBalance: Number(payload.points_balance ?? 0),
        userRewardId: String(payload.user_reward_id ?? ""),
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "兌換失敗";
    console.error("[redeemPointsCatalogItem]", error);
    return { success: false, error: message };
  }
}
