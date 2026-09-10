import {
  getAdminRewardActivity,
  listAdminRewardActivities,
} from "@/app/actions/admin-reward-activities";
import { parseRewardCouponCenter } from "@/lib/rewards/mapUserRewardCoupon";
import { runAsAdmin } from "../../shared/auth-context";
import { createServiceRoleClient } from "../../shared/supabase-admin";

export async function getRewardTemplateRowByTitle(title: string): Promise<{
  id: string;
  type: string;
  restrictions: Record<string, unknown>;
  reward_value: Record<string, unknown>;
} | null> {
  const templateId = await getTemplateIdByTitle(title);
  if (!templateId) {
    return null;
  }

  return runAsAdmin(async () => {
    const activity = await getAdminRewardActivity(templateId);
    if (!activity.success) {
      throw new Error(`[getRewardTemplateRowByTitle] ${activity.error}`);
    }

    const row = activity.data;
    return {
      id: row.id,
      type: row.type,
      restrictions: { ...row.restrictions },
      reward_value: row.reward_value,
    };
  });
}

export async function getTemplateIdByTitle(title: string): Promise<string | null> {
  return runAsAdmin(async () => {
    const list = await listAdminRewardActivities({
      status: "all",
      pageSize: 200,
    });
    if (!list.success) {
      throw new Error(`[getTemplateIdByTitle] ${list.error}`);
    }

    const row = list.data.rows.find((entry) => entry.title === title);
    return row?.activity_id ?? null;
  });
}

export async function findLatestUserRewardForTemplate(params: {
  userId: string;
  templateId: string;
}): Promise<string | null> {
  const admin = createServiceRoleClient();
  const { data, error } = await admin
    .from("user_rewards")
    .select("id")
    .eq("user_id", params.userId)
    .eq("template_id", params.templateId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`[findLatestUserRewardForTemplate] ${error.message}`);
  }

  return data?.id ?? null;
}

export async function getUserRewardGrantRow(userRewardId: string) {
  const admin = createServiceRoleClient();
  const { data, error } = await admin
    .from("user_rewards")
    .select("grant_dedup_key, is_used")
    .eq("id", userRewardId)
    .maybeSingle();

  if (error) {
    throw new Error(`[getUserRewardGrantRow] ${error.message}`);
  }

  return data;
}

export async function invokeAutoGrantForUser(userId: string): Promise<void> {
  const admin = createServiceRoleClient();
  const { error } = await admin.rpc("fn_try_auto_grant_rewards", {
    p_user_id: userId,
  });
  if (error) {
    throw new Error(`[invokeAutoGrantForUser] ${error.message}`);
  }
}

export async function setProfileCompletedTradesCount(
  userId: string,
  count: number,
): Promise<void> {
  const admin = createServiceRoleClient();
  const { error } = await admin
    .from("profiles")
    .update({ completed_trades_count: count })
    .eq("id", userId);
  if (error) {
    throw new Error(`[setProfileCompletedTradesCount] ${error.message}`);
  }
}

export async function getPointLedgerGrantForTemplate(params: {
  userId: string;
  templateId: string;
}): Promise<number | null> {
  const admin = createServiceRoleClient();
  const { data, error } = await admin
    .from("point_ledger")
    .select("amount")
    .eq("user_id", params.userId)
    .eq("source_type", "reward_template")
    .eq("source_ref", params.templateId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`[getPointLedgerGrantForTemplate] ${error.message}`);
  }

  return data?.amount == null ? null : Number(data.amount);
}

export async function getFlashCampaignClaimedCount(
  templateId: string,
): Promise<number> {
  return runAsAdmin(async () => {
    const activity = await getAdminRewardActivity(templateId);
    if (!activity.success) {
      throw new Error(`[getFlashCampaignClaimedCount] ${activity.error}`);
    }
    return Number(activity.data.campaign_claimed_count ?? 0);
  });
}

export async function getFlashCampaignIdForTemplate(
  templateId: string,
): Promise<string | null> {
  return runAsAdmin(async () => {
    const activity = await getAdminRewardActivity(templateId);
    if (!activity.success) {
      throw new Error(`[getFlashCampaignIdForTemplate] ${activity.error}`);
    }
    return activity.data.campaign_id;
  });
}

export async function assertTemplateStatusActive(
  templateId: string,
): Promise<void> {
  return runAsAdmin(async () => {
    const activity = await getAdminRewardActivity(templateId);
    if (!activity.success) {
      throw new Error(`[assertTemplateStatusActive] ${activity.error}`);
    }
    if (activity.data.status !== "active") {
      throw new Error(
        `Expected template ${templateId} status=active, got ${activity.data.status}`,
      );
    }
  });
}

export async function assertRewardCampaignExists(
  templateId: string,
): Promise<string> {
  const campaignId = await getFlashCampaignIdForTemplate(templateId);
  if (!campaignId) {
    throw new Error(`Expected reward_campaigns row for template ${templateId}`);
  }
  return campaignId;
}

export async function getRewardCouponCenterForUserId(userId: string) {
  const admin = createServiceRoleClient();
  const { data, error } = await admin.rpc("get_reward_coupon_center", {
    p_user_id: userId,
  });
  if (error) {
    throw new Error(`[getRewardCouponCenterForUserId] ${error.message}`);
  }

  return parseRewardCouponCenter(data);
}
