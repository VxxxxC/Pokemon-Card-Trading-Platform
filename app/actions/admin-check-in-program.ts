"use server";

import { revalidatePath } from "next/cache";
import {
  parseCheckInProgramRow,
  upsertInputToRpcPayload,
} from "@/lib/admin-check-in-program/parse-check-in-program";
import type {
  CheckInProgramRow,
  CheckInProgramUpsertInput,
} from "@/lib/admin-check-in-program/types";
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

type CheckInProgramRpcClient = {
  rpc(
    fn: "rpc_admin_get_check_in_program",
  ): Promise<{ data: unknown; error: { message: string } | null }>;
  rpc(
    fn: "rpc_admin_upsert_check_in_program",
    args: { p_payload: Record<string, unknown> },
  ): Promise<{ data: unknown; error: { message: string } | null }>;
};

function asCheckInProgramRpcClient(
  supabase: Awaited<ReturnType<typeof createClient>>,
): CheckInProgramRpcClient {
  return supabase as unknown as CheckInProgramRpcClient;
}

export async function getAdminCheckInProgram(): Promise<
  ActionResult<CheckInProgramRow>
> {
  const guard = await requireAdmin();
  if (!guard.ok) {
    return { success: false, error: guard.error };
  }

  try {
    const supabase = await createClient();
    const { data, error } = await asCheckInProgramRpcClient(supabase).rpc(
      "rpc_admin_get_check_in_program",
    );

    if (error) {
      console.error("[getAdminCheckInProgram]", error.message);
      return { success: false, error: mapRpcError(error.message) };
    }

    const payload = data as Record<string, unknown> | null;
    const row = parseCheckInProgramRow(payload?.row);
    if (!row) {
      return { success: false, error: "找不到簽到計劃" };
    }

    return { success: true, data: row };
  } catch (error) {
    console.error("[getAdminCheckInProgram]", error);
    return { success: false, error: "無法載入簽到計劃" };
  }
}

export async function upsertAdminCheckInProgram(
  input: CheckInProgramUpsertInput,
): Promise<ActionResult<CheckInProgramRow>> {
  const guard = await requireAdmin();
  if (!guard.ok) {
    return { success: false, error: guard.error };
  }

  try {
    const supabase = await createClient();
    const { data, error } = await asCheckInProgramRpcClient(supabase).rpc(
      "rpc_admin_upsert_check_in_program",
      { p_payload: upsertInputToRpcPayload(input) },
    );

    if (error) {
      console.error("[upsertAdminCheckInProgram]", error.message);
      return { success: false, error: mapRpcError(error.message) };
    }

    const payload = data as Record<string, unknown> | null;
    const row = parseCheckInProgramRow(payload?.row);
    if (!row) {
      return { success: false, error: "儲存失敗" };
    }

    revalidatePath("/admin/campaigns");
    revalidatePath("/profile/user");

    return { success: true, data: row };
  } catch (error) {
    console.error("[upsertAdminCheckInProgram]", error);
    return { success: false, error: "儲存失敗，請稍後再試" };
  }
}
