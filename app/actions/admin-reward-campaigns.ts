"use server";

import { revalidatePath } from "next/cache";
import {
  parseAdminRewardCampaignListPayload,
  parseAdminRewardCampaignRow,
} from "@/lib/admin-rewards/parse-admin-reward-campaign";
import type {
  AdminRewardCampaignRow,
  AdminRewardCampaignStatus,
  AdminRewardCampaignUpsertInput,
} from "@/lib/admin-rewards/types";
import { isCurrentUserAdmin } from "@/lib/auth/require-admin";
import { getOptionalAuthUser } from "@/lib/auth/session";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

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

function mapRpcError(message: string): string {
  if (message.includes("無管理員權限")) {
    return "無管理員權限";
  }
  return message || "操作失敗，請稍後再試";
}

type AdminCampaignRpcClient = {
  rpc(
    fn: "rpc_admin_list_reward_campaigns",
    args: { p_status: string; p_page: number; p_page_size: number },
  ): Promise<{ data: unknown; error: { message: string } | null }>;
  rpc(
    fn: "rpc_admin_upsert_reward_campaign",
    args: { p_payload: Record<string, unknown> },
  ): Promise<{ data: unknown; error: { message: string } | null }>;
  rpc(
    fn: "rpc_admin_set_reward_campaign_status",
    args: { p_campaign_id: string; p_status: string },
  ): Promise<{ data: unknown; error: { message: string } | null }>;
};

function asAdminCampaignRpcClient(
  supabase: Awaited<ReturnType<typeof createClient>>,
): AdminCampaignRpcClient {
  return supabase as unknown as AdminCampaignRpcClient;
}

function buildCampaignPayload(
  input: AdminRewardCampaignUpsertInput,
): Record<string, unknown> {
  return {
    id: input.id ?? null,
    template_id: input.template_id,
    name: input.name.trim(),
    status: input.status ?? "draft",
    starts_at: input.starts_at,
    ends_at: input.ends_at,
    max_claims: input.max_claims,
    max_claims_per_user: input.max_claims_per_user ?? 1,
    override_valid_days: input.override_valid_days ?? null,
  };
}

export async function listAdminRewardCampaigns(params?: {
  status?: AdminRewardCampaignStatus | "all";
  page?: number;
  pageSize?: number;
}): Promise<
  ActionResult<{
    rows: AdminRewardCampaignRow[];
    total: number;
    page: number;
    pageSize: number;
  }>
> {
  const guard = await requireAdmin();
  if (!guard.ok) {
    return { success: false, error: guard.error };
  }

  try {
    const supabase = asAdminCampaignRpcClient(await createClient());
    const { data, error } = await supabase.rpc("rpc_admin_list_reward_campaigns", {
      p_status: params?.status ?? "all",
      p_page: params?.page ?? 1,
      p_page_size: params?.pageSize ?? 20,
    });

    if (error) {
      return { success: false, error: mapRpcError(error.message) };
    }

    return { success: true, data: parseAdminRewardCampaignListPayload(data) };
  } catch (error) {
    console.error("[listAdminRewardCampaigns]", error);
    return { success: false, error: "無法載入活動檔期" };
  }
}

export async function upsertAdminRewardCampaign(
  input: AdminRewardCampaignUpsertInput,
): Promise<ActionResult<{ campaignId: string; row: AdminRewardCampaignRow }>> {
  const guard = await requireAdmin();
  if (!guard.ok) {
    return { success: false, error: guard.error };
  }

  try {
    const supabase = asAdminCampaignRpcClient(await createClient());
    const { data, error } = await supabase.rpc("rpc_admin_upsert_reward_campaign", {
      p_payload: buildCampaignPayload(input),
    });

    if (error) {
      return { success: false, error: mapRpcError(error.message) };
    }

    const payload = data as Record<string, unknown> | null;
    const row = parseAdminRewardCampaignRow(payload?.row);
    const campaignId =
      typeof payload?.campaign_id === "string" ? payload.campaign_id : row?.id;

    if (!row || !campaignId) {
      return { success: false, error: "活動儲存回應異常" };
    }

    revalidatePath("/admin/campaigns");
    return { success: true, data: { campaignId, row } };
  } catch (error) {
    console.error("[upsertAdminRewardCampaign]", error);
    return { success: false, error: "無法儲存活動檔期" };
  }
}

export async function setAdminRewardCampaignStatus(
  campaignId: string,
  status: AdminRewardCampaignStatus,
): Promise<ActionResult<{ row: AdminRewardCampaignRow }>> {
  const guard = await requireAdmin();
  if (!guard.ok) {
    return { success: false, error: guard.error };
  }

  try {
    const supabase = asAdminCampaignRpcClient(await createClient());
    const { data, error } = await supabase.rpc(
      "rpc_admin_set_reward_campaign_status",
      {
        p_campaign_id: campaignId,
        p_status: status,
      },
    );

    if (error) {
      return { success: false, error: mapRpcError(error.message) };
    }

    const payload = data as Record<string, unknown> | null;
    const row = parseAdminRewardCampaignRow(payload?.row);
    if (!row) {
      return { success: false, error: "活動狀態更新回應異常" };
    }

    revalidatePath("/admin/campaigns");
    return { success: true, data: { row } };
  } catch (error) {
    console.error("[setAdminRewardCampaignStatus]", error);
    return { success: false, error: "無法更新活動狀態" };
  }
}
