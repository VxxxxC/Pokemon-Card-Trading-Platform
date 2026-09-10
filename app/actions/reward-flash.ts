"use server";

import type { FlashCampaignView } from "@/lib/admin-rewards/types";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import { requireActiveAuthUser } from "@/lib/auth/mutation-guard";

type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

type FlashRpcClient = {
  rpc(
    fn: "rpc_list_active_flash_campaigns",
  ): Promise<{ data: unknown; error: { message: string } | null }>;
  rpc(
    fn: "rpc_claim_flash_reward",
    args: { p_campaign_id: string },
  ): Promise<{ data: unknown; error: { message: string } | null }>;
};

function parseFlashCampaigns(data: unknown): FlashCampaignView[] {
  if (!Array.isArray(data)) {
    return [];
  }

  return data.flatMap((entry) => {
    if (!entry || typeof entry !== "object") {
      return [];
    }

    const row = entry as Record<string, unknown>;
    const template =
      row.template && typeof row.template === "object"
        ? (row.template as Record<string, unknown>)
        : null;

    if (typeof row.id !== "string" || !template || typeof template.id !== "string") {
      return [];
    }

    return [
      {
        id: row.id,
        name: typeof row.name === "string" ? row.name : "限時搶券",
        starts_at: typeof row.starts_at === "string" ? row.starts_at : "",
        ends_at: typeof row.ends_at === "string" ? row.ends_at : "",
        max_claims: Number(row.max_claims ?? 0),
        claimed_count: Number(row.claimed_count ?? 0),
        max_claims_per_user: Number(row.max_claims_per_user ?? 1),
        remaining_claims: Number(row.remaining_claims ?? 0),
        user_claims_today: Number(row.user_claims_today ?? 0),
        can_claim: row.can_claim === true,
        template: {
          id: template.id,
          title: typeof template.title === "string" ? template.title : "優惠券",
          description:
            typeof template.description === "string" ? template.description : null,
          type: typeof template.type === "string" ? template.type : "discount_coupon",
          reward_value:
            template.reward_value && typeof template.reward_value === "object"
              ? (template.reward_value as Record<string, unknown>)
              : {},
        },
      },
    ];
  });
}

export async function listActiveFlashCampaigns(): Promise<
  ActionResult<FlashCampaignView[]>
> {
  if (!isSupabaseConfigured()) {
    return { success: false, error: "未登入" };
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
      supabase as unknown as FlashRpcClient
    ).rpc("rpc_list_active_flash_campaigns");

    if (error) {
      console.error("[listActiveFlashCampaigns]", error.message);
      return { success: false, error: error.message };
    }

    return { success: true, data: parseFlashCampaigns(data) };
  } catch (error) {
    console.error("[listActiveFlashCampaigns]", error);
    return { success: false, error: "無法載入限時搶券活動" };
  }
}

export async function claimFlashReward(
  campaignId: string,
): Promise<ActionResult<{ userRewardId: string }>> {
  if (!isSupabaseConfigured()) {
    return { success: false, error: "未登入" };
  }

  const trimmedId = campaignId.trim();
  if (!trimmedId) {
    return { success: false, error: "活動編號無效" };
  }

  try {
    const auth = await requireActiveAuthUser();
    if (!auth.ok) {
      return { success: false, error: auth.error };
    }
    const { supabase } = auth;

    const { data, error } = await (
      supabase as unknown as FlashRpcClient
    ).rpc("rpc_claim_flash_reward", {
      p_campaign_id: trimmedId,
    });

    if (error) {
      console.error("[claimFlashReward]", error.message);
      return { success: false, error: error.message };
    }

    const payload = data as Record<string, unknown> | null;
    const userRewardId =
      typeof payload?.user_reward_id === "string" ? payload.user_reward_id : null;

    if (!userRewardId) {
      return { success: false, error: "搶券回應異常" };
    }

    return { success: true, data: { userRewardId } };
  } catch (error) {
    console.error("[claimFlashReward]", error);
    return { success: false, error: "搶券失敗，請稍後再試" };
  }
}
