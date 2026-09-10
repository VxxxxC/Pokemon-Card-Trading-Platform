"use server";

import { revalidatePath } from "next/cache";
import {
  parseAdminRewardTemplateListPayload,
  parseAdminRewardTemplateRow,
} from "@/lib/admin-rewards/parse-admin-reward-template";
import type {
  AdminRewardTemplateRow,
  AdminRewardTemplateStatus,
  AdminRewardTemplateType,
  AdminRewardTemplateUpsertInput,
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

type AdminRewardsRpcClient = {
  rpc(
    fn: "rpc_admin_list_reward_templates",
    args: {
      p_status: string;
      p_type: string | null;
      p_page: number;
      p_page_size: number;
    },
  ): Promise<{ data: unknown; error: { message: string } | null }>;
  rpc(
    fn: "rpc_admin_upsert_reward_template",
    args: { p_payload: Record<string, unknown> },
  ): Promise<{ data: unknown; error: { message: string } | null }>;
  rpc(
    fn: "rpc_admin_set_reward_template_status",
    args: { p_template_id: string; p_status: string },
  ): Promise<{ data: unknown; error: { message: string } | null }>;
};

function asAdminRewardsRpcClient(
  supabase: Awaited<ReturnType<typeof createClient>>,
): AdminRewardsRpcClient {
  return supabase as unknown as AdminRewardsRpcClient;
}

function buildUpsertPayload(
  input: AdminRewardTemplateUpsertInput,
): Record<string, unknown> {
  return {
    id: input.id ?? null,
    title: input.title.trim(),
    description: input.description?.trim() || null,
    type: input.type,
    reward_value: input.reward_value,
    trigger_conditions: input.trigger_conditions,
    is_infinite: input.is_infinite,
    max_claims: input.is_infinite ? null : (input.max_claims ?? null),
    valid_duration_days: input.valid_duration_days ?? null,
    fixed_expiry_date: input.fixed_expiry_date ?? null,
    distribution_mode: input.distribution_mode ?? "auto_grant",
    restrictions: input.restrictions ?? {
      order_kinds: ["merchant"],
      requires_authentication: "any",
      shipping_methods: ["sf"],
      min_item_subtotal_hkd: 0,
    },
  };
}

export async function listAdminRewardTemplates(params?: {
  status?: AdminRewardTemplateStatus | "all";
  type?: AdminRewardTemplateType | "all";
  page?: number;
  pageSize?: number;
}): Promise<
  ActionResult<{
    rows: AdminRewardTemplateRow[];
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
    const supabase = asAdminRewardsRpcClient(await createClient());
    const { data, error } = await supabase.rpc("rpc_admin_list_reward_templates", {
      p_status: params?.status ?? "all",
      p_type:
        params?.type && params.type !== "all" ? params.type : null,
      p_page: params?.page ?? 1,
      p_page_size: params?.pageSize ?? 20,
    });

    if (error) {
      console.error("[listAdminRewardTemplates]", error.message);
      return { success: false, error: mapRpcError(error.message) };
    }

    const parsed = parseAdminRewardTemplateListPayload(data);
    if (!parsed) {
      return { success: false, error: "無法載入獎勵模板" };
    }

    return { success: true, data: parsed };
  } catch (error) {
    console.error("[listAdminRewardTemplates]", error);
    return { success: false, error: "無法載入獎勵模板" };
  }
}

export async function upsertAdminRewardTemplate(
  input: AdminRewardTemplateUpsertInput,
): Promise<ActionResult<{ templateId: string; row: AdminRewardTemplateRow }>> {
  const guard = await requireAdmin();
  if (!guard.ok) {
    return { success: false, error: guard.error };
  }

  if (!input.title.trim()) {
    return { success: false, error: "請填寫標題" };
  }

  try {
    const supabase = asAdminRewardsRpcClient(await createClient());
    const { data, error } = await supabase.rpc("rpc_admin_upsert_reward_template", {
      p_payload: buildUpsertPayload(input),
    });

    if (error) {
      console.error("[upsertAdminRewardTemplate]", error.message);
      return { success: false, error: mapRpcError(error.message) };
    }

    const payload =
      data && typeof data === "object"
        ? (data as Record<string, unknown>)
        : null;
    const templateId =
      payload && typeof payload.template_id === "string"
        ? payload.template_id
        : null;
    const row = parseAdminRewardTemplateRow(payload?.row);

    if (!templateId || !row) {
      return { success: false, error: "無法儲存獎勵模板" };
    }

    revalidatePath("/admin/campaigns");
    return { success: true, data: { templateId, row } };
  } catch (error) {
    console.error("[upsertAdminRewardTemplate]", error);
    return { success: false, error: "無法儲存獎勵模板" };
  }
}

export async function setAdminRewardTemplateStatus(
  templateId: string,
  status: AdminRewardTemplateStatus,
): Promise<ActionResult<{ row: AdminRewardTemplateRow }>> {
  const guard = await requireAdmin();
  if (!guard.ok) {
    return { success: false, error: guard.error };
  }

  const trimmedId = templateId.trim();
  if (!trimmedId) {
    return { success: false, error: "找不到獎勵模板" };
  }

  try {
    const supabase = asAdminRewardsRpcClient(await createClient());
    const { data, error } = await supabase.rpc(
      "rpc_admin_set_reward_template_status",
      {
        p_template_id: trimmedId,
        p_status: status,
      },
    );

    if (error) {
      console.error("[setAdminRewardTemplateStatus]", error.message);
      return { success: false, error: mapRpcError(error.message) };
    }

    const payload =
      data && typeof data === "object"
        ? (data as Record<string, unknown>)
        : null;
    const row = parseAdminRewardTemplateRow(payload?.row);

    if (!row) {
      return { success: false, error: "無法更新模板狀態" };
    }

    revalidatePath("/admin/campaigns");
    return { success: true, data: { row } };
  } catch (error) {
    console.error("[setAdminRewardTemplateStatus]", error);
    return { success: false, error: "無法更新模板狀態" };
  }
}
