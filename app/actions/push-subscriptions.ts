"use server";

import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { TablesInsert } from "@/types/supabase";

type PushSubscriptionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

export type UpsertUserPushSubscriptionInput = {
  onesignalSubscriptionId: string;
  onesignalUserId?: string | null;
  optedIn: boolean;
};

function normalizeOptionalId(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function validateUpsertInput(
  input: UpsertUserPushSubscriptionInput,
): string | null {
  const subscriptionId = input.onesignalSubscriptionId.trim();
  if (!subscriptionId) {
    return "缺少推送訂閱 ID";
  }

  if (subscriptionId.length > 200) {
    return "推送訂閱 ID 過長";
  }

  const onesignalUserId = normalizeOptionalId(input.onesignalUserId);
  if (onesignalUserId && onesignalUserId.length > 200) {
    return "OneSignal 用戶 ID 過長";
  }

  return null;
}

async function getAuthenticatedUserId(): Promise<string | null> {
  if (!isSupabaseConfigured()) {
    return null;
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return user?.id ?? null;
}

function getPushSubscriptionAdminClient() {
  if (!isSupabaseConfigured()) {
    throw new Error("Supabase is not configured");
  }

  return createAdminClient();
}

export async function getPushSubscriptionExternalUserId(): Promise<
  string | null
> {
  return getAuthenticatedUserId();
}

export async function upsertUserPushSubscription(
  input: UpsertUserPushSubscriptionInput,
): Promise<PushSubscriptionResult<{ id: string }>> {
  const validationError = validateUpsertInput(input);
  if (validationError) {
    return { success: false, error: validationError };
  }

  const userId = await getAuthenticatedUserId();
  if (!userId) {
    return { success: false, error: "請先登入" };
  }

  const row: TablesInsert<"user_push_subscriptions"> = {
    user_id: userId,
    onesignal_subscription_id: input.onesignalSubscriptionId.trim(),
    onesignal_user_id: normalizeOptionalId(input.onesignalUserId),
    opted_in: input.optedIn,
    updated_at: new Date().toISOString(),
  };

  const supabase = getPushSubscriptionAdminClient();
  const subscriptionId = input.onesignalSubscriptionId.trim();
  const { data: existing, error: selectError } = await supabase
    .from("user_push_subscriptions")
    .select("id")
    .eq("user_id", userId)
    .eq("onesignal_subscription_id", subscriptionId)
    .maybeSingle();

  if (selectError) {
    return { success: false, error: "無法儲存推送訂閱" };
  }

  const payload = {
    onesignal_user_id: normalizeOptionalId(input.onesignalUserId),
    opted_in: input.optedIn,
    updated_at: new Date().toISOString(),
  };

  const writeResult = existing?.id
    ? await supabase
        .from("user_push_subscriptions")
        .update(payload)
        .eq("id", existing.id)
        .select("id")
        .maybeSingle()
    : await supabase
        .from("user_push_subscriptions")
        .insert(row)
        .select("id")
        .maybeSingle();

  const { data, error } = writeResult;

  if (error) {
    return { success: false, error: "無法儲存推送訂閱" };
  }

  if (!data?.id) {
    return { success: false, error: "無法儲存推送訂閱" };
  }

  return { success: true, data: { id: data.id } };
}

export async function optOutUserPushSubscription(
  onesignalSubscriptionId: string,
): Promise<PushSubscriptionResult<{ id: string }>> {
  const trimmed = onesignalSubscriptionId.trim();
  if (!trimmed) {
    return { success: false, error: "缺少推送訂閱 ID" };
  }

  const userId = await getAuthenticatedUserId();
  if (!userId) {
    return { success: false, error: "請先登入" };
  }

  const supabase = getPushSubscriptionAdminClient();
  const { data, error } = await supabase
    .from("user_push_subscriptions")
    .update({
      opted_in: false,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId)
    .eq("onesignal_subscription_id", trimmed)
    .select("id")
    .maybeSingle();

  if (error) {
    return { success: false, error: "無法更新推送訂閱" };
  }

  if (!data?.id) {
    return { success: true, data: { id: "" } };
  }

  return { success: true, data: { id: data.id } };
}
