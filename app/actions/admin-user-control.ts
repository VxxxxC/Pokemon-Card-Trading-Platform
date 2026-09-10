"use server";

import {
  emptyPlatformUserPage,
  mapRpcRowToPlatformUserRow,
  normalizePlatformUserTypes,
  parsePlatformUsersRpcPayload,
  resolvePlatformUsersKeyword,
  resolvePlatformUsersPage,
  resolvePlatformUsersPageSize,
  toPlatformUserPage,
  toRpcKycFilter,
  type PlatformUsersRpcRow,
} from "@/lib/admin-user-control/platform-users-rpc";
import type {
  ListAdminPlatformUsersInput,
  ListAdminPlatformUsersResult,
} from "@/lib/admin-user-control/types";
import { isCurrentUserAdmin } from "@/lib/auth/require-admin";
import { getOptionalAuthUser } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

type PlatformUsersRpcClient = {
  rpc(
    fn: "search_admin_platform_users",
    args: {
      p_keyword?: string | null;
      p_user_types?: string[];
      p_kyc_filter?: string;
      p_page?: number;
      p_page_size?: number;
    },
  ): Promise<{ data: unknown; error: { message: string } | null }>;
};

function asPlatformUsersRpcClient(
  supabase: Awaited<ReturnType<typeof createClient>>,
): PlatformUsersRpcClient {
  return supabase as unknown as PlatformUsersRpcClient;
}

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

async function enrichPlatformUserEmails(
  rows: PlatformUsersRpcRow[],
): Promise<Map<string, string>> {
  const emailByUserId = new Map<string, string>();
  const admin = createAdminClient();

  const rowsNeedingAuthEmail = rows.filter(
    (row) => !row.rep_email?.trim(),
  );

  await Promise.all(
    rowsNeedingAuthEmail.map(async (row) => {
      const { data, error } = await admin.auth.admin.getUserById(row.id);
      if (error) {
        emailByUserId.set(row.id, "—");
        return;
      }
      emailByUserId.set(row.id, data.user.email ?? "—");
    }),
  );

  return emailByUserId;
}

export async function listAdminPlatformUsers(
  input: ListAdminPlatformUsersInput = {},
): Promise<ListAdminPlatformUsersResult> {
  const guard = await requireAdmin();
  if (!guard.ok) {
    return { success: false, error: guard.error };
  }

  const page = resolvePlatformUsersPage(input.page);
  const pageSize = resolvePlatformUsersPageSize(input.pageSize);
  const userTypes = normalizePlatformUserTypes(input.userTypes);

  if (userTypes.length === 0) {
    return { success: true, data: emptyPlatformUserPage(page, pageSize) };
  }

  try {
    const supabase = asPlatformUsersRpcClient(await createClient());
    const { data, error } = await supabase.rpc("search_admin_platform_users", {
      p_keyword: resolvePlatformUsersKeyword(input.search),
      p_user_types: userTypes,
      p_kyc_filter: toRpcKycFilter(input.kycFilter),
      p_page: page,
      p_page_size: pageSize,
    });

    if (error) {
      console.error("[listAdminPlatformUsers] rpc", error);
      return { success: false, error: "無法載入平台用戶列表" };
    }

    const payload = parsePlatformUsersRpcPayload(data);
    if (!payload) {
      return { success: false, error: "無法載入平台用戶列表" };
    }

    const emailByUserId = await enrichPlatformUserEmails(payload.rows);
    const rows = payload.rows.map((row) => {
      const email =
        row.rep_email?.trim() ||
        emailByUserId.get(row.id) ||
        "—";
      return mapRpcRowToPlatformUserRow(row, email);
    });

    return {
      success: true,
      data: toPlatformUserPage(payload, rows),
    };
  } catch (error) {
    console.error("[listAdminPlatformUsers]", error);
    return { success: false, error: "無法載入平台用戶列表" };
  }
}
