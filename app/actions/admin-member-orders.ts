"use server";

import { revalidatePath } from "next/cache";
import { isCurrentUserAdmin } from "@/lib/auth/require-admin";
import { getOptionalAuthUser } from "@/lib/auth/session";
import type { MemberOrderActionResult } from "@/app/actions/orders";
import {
  runMemberAuthMockFlowDev,
  type MemberAuthMockFlowResult,
} from "@/lib/member-order/dev-mock-flow";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

type DevAdminAccessResult = { ok: true } | { ok: false; error: string };

/**
 * Fail-closed gate for dev-only member-auth mock RPCs.
 * Production: blocked by NODE_ENV.
 * Non-production: requires authenticated platform admin (not env-name trust alone).
 */
async function assertDevAdminMemberOrderAccess(): Promise<DevAdminAccessResult> {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: "未登入" };
  }

  if (process.env.NODE_ENV === "production") {
    return { ok: false, error: "此操作僅限開發環境使用" };
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

  return { ok: true };
}

async function runAdminAuthRpc(
  fn:
    | "rpc_confirm_platform_received"
    | "rpc_complete_member_auth_grading"
    | "rpc_fail_member_auth_order",
  orderId: string,
): Promise<MemberOrderActionResult> {
  const access = await assertDevAdminMemberOrderAccess();
  if (!access.ok) {
    return { success: false, error: access.error };
  }

  const trimmedOrderId = orderId.trim();
  if (!trimmedOrderId) {
    return { success: false, error: "找不到此訂單" };
  }

  try {
    const admin = createAdminClient();
    const { error } = await (
      admin as unknown as {
        rpc: (
          name: typeof fn,
          rpcArgs: { p_order_id: string },
        ) => Promise<{ error: { message: string } | null }>;
      }
    ).rpc(fn, { p_order_id: trimmedOrderId });

    if (error) {
      console.error(`[${fn}]`, error.message);
      return { success: false, error: error.message };
    }

    revalidatePath("/profile/user/trading");
    revalidatePath("/profile/user/orderDetail/" + trimmedOrderId);

    return { success: true };
  } catch (error) {
    console.error(`[${fn}]`, error);
    return { success: false, error: "平台操作失敗，請稍後再試" };
  }
}

export async function confirmPlatformReceived(
  orderId: string,
): Promise<MemberOrderActionResult> {
  return runAdminAuthRpc("rpc_confirm_platform_received", orderId);
}

export async function completeAuthGrading(
  orderId: string,
): Promise<MemberOrderActionResult> {
  return runAdminAuthRpc("rpc_complete_member_auth_grading", orderId);
}

export async function failMemberAuthOrder(
  orderId: string,
): Promise<MemberOrderActionResult> {
  return runAdminAuthRpc("rpc_fail_member_auth_order", orderId);
}

export async function submitOutboundTracking(
  orderId: string,
  trackingNo: string,
): Promise<MemberOrderActionResult> {
  const access = await assertDevAdminMemberOrderAccess();
  if (!access.ok) {
    return { success: false, error: access.error };
  }

  const trimmedOrderId = orderId.trim();
  const trimmedTracking = trackingNo.trim();
  if (!trimmedOrderId) {
    return { success: false, error: "找不到此訂單" };
  }
  if (!trimmedTracking) {
    return { success: false, error: "請輸入有效的物流單號" };
  }

  try {
    const admin = createAdminClient();
    const { error } = await (
      admin as unknown as {
        rpc: (
          fn: "rpc_submit_outbound_tracking",
          args: { p_order_id: string; p_tracking_no: string },
        ) => Promise<{ error: { message: string } | null }>;
      }
    ).rpc("rpc_submit_outbound_tracking", {
      p_order_id: trimmedOrderId,
      p_tracking_no: trimmedTracking,
    });

    if (error) {
      console.error("[submitOutboundTracking]", error.message);
      return { success: false, error: error.message };
    }

    revalidatePath("/profile/user/trading");
    revalidatePath("/profile/user/orderDetail/" + trimmedOrderId);

    return { success: true };
  } catch (error) {
    console.error("[submitOutboundTracking]", error);
    return { success: false, error: "上載物流單號失敗" };
  }
}

export type RunMemberAuthMockFlowDevResult =
  | { success: true; data: MemberAuthMockFlowResult }
  | { success: false; error: string };

export async function runMemberAuthMockFlowDevAction(
  orderId: string,
): Promise<RunMemberAuthMockFlowDevResult> {
  const access = await assertDevAdminMemberOrderAccess();
  if (!access.ok) {
    return { success: false, error: access.error };
  }

  const trimmedOrderId = orderId.trim();
  if (!trimmedOrderId) {
    return { success: false, error: "找不到此訂單" };
  }

  try {
    const admin = createAdminClient();
    const data = await runMemberAuthMockFlowDev(admin, trimmedOrderId);

    revalidatePath("/profile/user/trading");
    revalidatePath("/profile/user/orderDetail/" + trimmedOrderId);

    return { success: true, data };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Mock 流程推進失敗";
    console.error("[runMemberAuthMockFlowDevAction]", error);
    return { success: false, error: message };
  }
}
