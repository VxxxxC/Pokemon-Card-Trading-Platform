"use server";

import { revalidatePath } from "next/cache";
import {
  parseAdminRewardActivityListPayload,
  parseAdminRewardActivityRow,
} from "@/lib/admin-rewards/parse-admin-reward-activity";
import {
  resolveActivityTriggerConditions,
  sanitizeRedemptionCatalogForType,
} from "@/lib/admin-rewards/template-form";
import type {
  AdminRewardActivityRow,
  AdminRewardActivityStatus,
  AdminRewardActivityUpsertInput,
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

function isMissingRpcError(message: string): boolean {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("could not find the function") ||
    normalized.includes("schema cache")
  );
}

type AdminActivityRpcClient = {
  rpc(
    fn: "rpc_admin_list_reward_activities",
    args: {
      p_status: string;
      p_page: number;
      p_page_size: number;
      p_search?: string | null;
    },
  ): Promise<{ data: unknown; error: { message: string } | null }>;
  rpc(
    fn: "rpc_admin_reward_activity_status_counts",
    args?: { p_search?: string | null },
  ): Promise<{ data: unknown; error: { message: string } | null }>;
  rpc(
    fn: "rpc_admin_get_reward_activity",
    args: { p_template_id: string },
  ): Promise<{ data: unknown; error: { message: string } | null }>;
  rpc(
    fn: "rpc_admin_upsert_reward_activity",
    args: { p_payload: Record<string, unknown> },
  ): Promise<{ data: unknown; error: { message: string } | null }>;
  rpc(
    fn: "rpc_admin_set_reward_activity_status",
    args: { p_template_id: string; p_status: string },
  ): Promise<{ data: unknown; error: { message: string } | null }>;
};

function asAdminActivityRpcClient(
  supabase: Awaited<ReturnType<typeof createClient>>,
): AdminActivityRpcClient {
  return supabase as unknown as AdminActivityRpcClient;
}

function localDateTimeToIso(value: string): string {
  if (!value.trim()) {
    return "";
  }
  const trimmed = value.trim();
  const withHongKongOffset = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(trimmed)
    ? `${trimmed}:00+08:00`
    : trimmed;
  const date = new Date(withHongKongOffset);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return date.toISOString();
}

function buildActivityPayload(
  input: AdminRewardActivityUpsertInput,
): Record<string, unknown> {
  const schedule = input.schedule ?? input.flash_schedule;
  const distributionMode = input.distribution_mode ?? "auto_grant";

  const sanitizedCatalog = sanitizeRedemptionCatalogForType(
    input.type,
    input.redemption_catalog,
  );

  const payload: Record<string, unknown> = {
    id: input.id ?? null,
    title: input.title.trim(),
    description: input.description?.trim() || null,
    type: input.type,
    reward_value: input.reward_value,
    trigger_conditions: resolveActivityTriggerConditions({
      ...input,
      redemption_catalog: sanitizedCatalog,
    }),
    is_infinite: input.is_infinite,
    max_claims: input.is_infinite ? null : (input.max_claims ?? null),
    valid_duration_days: input.valid_duration_days ?? null,
    fixed_expiry_date: input.fixed_expiry_date ?? null,
    distribution_mode: distributionMode,
    restrictions: input.restrictions ?? {
      order_kinds: ["merchant"],
      requires_authentication: "any",
      shipping_methods: ["sf"],
      min_item_subtotal_hkd: 0,
    },
  };

  if (sanitizedCatalog) {
    payload.redemption_catalog = {
      enabled: sanitizedCatalog.enabled,
      points_cost: sanitizedCatalog.points_cost,
      stock: sanitizedCatalog.stock,
      is_active: sanitizedCatalog.is_active,
      display_order: sanitizedCatalog.display_order ?? 0,
      max_redemptions_per_user:
        sanitizedCatalog.max_redemptions_per_user ?? null,
    };
  }

  if (schedule?.starts_at?.trim() && schedule?.ends_at?.trim()) {
    const scheduleName =
      ("name" in schedule && schedule.name) ||
      schedule.campaign_name ||
      input.title;
    payload.schedule = {
      campaign_id: schedule.campaign_id ?? null,
      name: scheduleName.trim(),
      starts_at: localDateTimeToIso(schedule.starts_at),
      ends_at: localDateTimeToIso(schedule.ends_at),
      max_claims:
        distributionMode === "flash_only"
          ? schedule.max_claims
          : (input.is_infinite ? 2147483647 : (input.max_claims ?? 2147483647)),
      max_claims_per_user:
        distributionMode === "flash_only" ? schedule.max_claims_per_user : 1,
      override_valid_days:
        distributionMode === "flash_only"
          ? schedule.override_valid_days
          : null,
      status:
        "status" in schedule && schedule.status ? schedule.status : null,
    };
  }

  return payload;
}

export async function listAdminRewardActivities(params?: {
  status?: string;
  page?: number;
  pageSize?: number;
  search?: string;
}): Promise<
  ActionResult<{
    rows: AdminRewardActivityRow[];
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
    const supabase = asAdminActivityRpcClient(await createClient());
    const search = params?.search?.trim() ?? "";
    const { data, error } = await supabase.rpc(
      "rpc_admin_list_reward_activities",
      {
        p_status: params?.status ?? "all",
        p_page: params?.page ?? 1,
        p_page_size: params?.pageSize ?? 50,
        p_search: search.length > 0 ? search : null,
      },
    );

    if (error) {
      console.error("[listAdminRewardActivities]", error.message);
      return { success: false, error: mapRpcError(error.message) };
    }

    const parsed = parseAdminRewardActivityListPayload(data);
    if (!parsed) {
      return { success: false, error: "無法載入獎勵活動" };
    }

    return { success: true, data: parsed };
  } catch (error) {
    console.error("[listAdminRewardActivities]", error);
    return { success: false, error: "無法載入獎勵活動" };
  }
}

const STATUS_COUNT_KEYS = [
  "all",
  "draft",
  "active",
  "paused",
  "ended",
  "archived",
] as const;

export type AdminRewardActivityStatusCountKey =
  (typeof STATUS_COUNT_KEYS)[number];

function parseAdminRewardActivityStatusCounts(
  raw: unknown,
): Record<AdminRewardActivityStatusCountKey, number> | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const row = raw as Record<string, unknown>;
  const next = {} as Record<AdminRewardActivityStatusCountKey, number>;
  for (const key of STATUS_COUNT_KEYS) {
    const value = Number(row[key] ?? 0);
    next[key] = Number.isFinite(value) ? value : 0;
  }
  return next;
}

export async function getAdminRewardActivityStatusCounts(params?: {
  search?: string;
}): Promise<
  ActionResult<Record<AdminRewardActivityStatusCountKey, number>>
> {
  const guard = await requireAdmin();
  if (!guard.ok) {
    return { success: false, error: guard.error };
  }

  try {
    const supabase = asAdminActivityRpcClient(await createClient());
    const search = params?.search?.trim() ?? "";
    const { data, error } = await supabase.rpc(
      "rpc_admin_reward_activity_status_counts",
      {
        p_search: search.length > 0 ? search : null,
      },
    );

    if (error) {
      if (isMissingRpcError(error.message)) {
        return { success: false, error: "活動統計尚未部署" };
      }
      console.error("[getAdminRewardActivityStatusCounts]", error.message);
      return { success: false, error: mapRpcError(error.message) };
    }

    const parsed = parseAdminRewardActivityStatusCounts(data);
    if (!parsed) {
      return { success: false, error: "無法載入活動統計" };
    }

    return { success: true, data: parsed };
  } catch (error) {
    console.error("[getAdminRewardActivityStatusCounts]", error);
    return { success: false, error: "無法載入活動統計" };
  }
}

export async function getAdminRewardActivity(
  templateId: string,
): Promise<ActionResult<AdminRewardActivityRow>> {
  const guard = await requireAdmin();
  if (!guard.ok) {
    return { success: false, error: guard.error };
  }

  const trimmedId = templateId.trim();
  if (!trimmedId) {
    return { success: false, error: "找不到獎勵活動" };
  }

  try {
    const supabase = asAdminActivityRpcClient(await createClient());
    const { data, error } = await supabase.rpc(
      "rpc_admin_get_reward_activity",
      { p_template_id: trimmedId },
    );

    if (error) {
      console.error("[getAdminRewardActivity]", error.message);
      return { success: false, error: mapRpcError(error.message) };
    }

    const payload =
      data && typeof data === "object"
        ? (data as Record<string, unknown>)
        : null;
    const row = parseAdminRewardActivityRow(payload?.row);

    if (!row) {
      return { success: false, error: "找不到獎勵活動" };
    }

    return { success: true, data: row };
  } catch (error) {
    console.error("[getAdminRewardActivity]", error);
    return { success: false, error: "無法載入獎勵活動" };
  }
}

export async function upsertAdminRewardActivity(
  input: AdminRewardActivityUpsertInput,
): Promise<
  ActionResult<{ activityId: string; row: AdminRewardActivityRow }>
> {
  const guard = await requireAdmin();
  if (!guard.ok) {
    return { success: false, error: guard.error };
  }

  if (!input.title.trim()) {
    return { success: false, error: "請填寫標題" };
  }

  if (input.distribution_mode === "flash_only") {
    const schedule = input.schedule ?? input.flash_schedule;
    if (!schedule?.starts_at || !schedule.ends_at) {
      return { success: false, error: "請設定搶券檔期時間" };
    }
  }

  try {
    const supabase = asAdminActivityRpcClient(await createClient());
    const { data, error } = await supabase.rpc(
      "rpc_admin_upsert_reward_activity",
      { p_payload: buildActivityPayload(input) },
    );

    if (error) {
      console.error("[upsertAdminRewardActivity]", error.message);
      return { success: false, error: mapRpcError(error.message) };
    }

    const payload =
      data && typeof data === "object"
        ? (data as Record<string, unknown>)
        : null;
    const activityId =
      payload && typeof payload.activity_id === "string"
        ? payload.activity_id
        : null;
    const row = parseAdminRewardActivityRow(payload?.row);

    if (!activityId || !row) {
      return { success: false, error: "無法儲存獎勵活動" };
    }

    revalidatePath("/admin/campaigns");
    revalidatePath(`/admin/campaigns/${activityId}`);
    return { success: true, data: { activityId, row } };
  } catch (error) {
    console.error("[upsertAdminRewardActivity]", error);
    return { success: false, error: "無法儲存獎勵活動" };
  }
}

export async function setAdminRewardActivityStatus(
  templateId: string,
  status: AdminRewardActivityStatus,
): Promise<ActionResult<{ row: AdminRewardActivityRow }>> {
  const guard = await requireAdmin();
  if (!guard.ok) {
    return { success: false, error: guard.error };
  }

  const trimmedId = templateId.trim();
  if (!trimmedId) {
    return { success: false, error: "找不到獎勵活動" };
  }

  try {
    const supabase = asAdminActivityRpcClient(await createClient());
    const { data, error } = await supabase.rpc(
      "rpc_admin_set_reward_activity_status",
      {
        p_template_id: trimmedId,
        p_status: status,
      },
    );

    if (error) {
      console.error("[setAdminRewardActivityStatus]", error.message);
      return { success: false, error: mapRpcError(error.message) };
    }

    const payload =
      data && typeof data === "object"
        ? (data as Record<string, unknown>)
        : null;
    const row = parseAdminRewardActivityRow(payload?.row);

    if (!row) {
      return { success: false, error: "無法更新活動狀態" };
    }

    revalidatePath("/admin/campaigns");
    revalidatePath(`/admin/campaigns/${trimmedId}`);
    return { success: true, data: { row } };
  } catch (error) {
    console.error("[setAdminRewardActivityStatus]", error);
    return { success: false, error: "無法更新活動狀態" };
  }
}
