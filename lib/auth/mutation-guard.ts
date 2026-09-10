import type { User } from "@supabase/supabase-js";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import { getOptionalAuthUser } from "@/lib/auth/session";

type ServerSupabaseClient = Awaited<ReturnType<typeof createClient>>;

type AccountAccessRestriction = {
  blocked?: boolean;
  type?: string;
  endsAt?: string | null;
  reason?: string | null;
};

type ModerationAccessRpcClient = {
  rpc(
    fn: "moderation_get_account_access_restriction",
    args: { p_user_id: string },
  ): Promise<{ data: unknown; error: { message: string } | null }>;
};

export type MutationGuardResult =
  | { ok: true; user: User; supabase: ServerSupabaseClient }
  | { ok: false; error: string };

/**
 * Central mutation gate: authenticated + not moderation-suspended.
 * Use for Server Actions and API mutations — do not rely on proxy.ts alone.
 */
export async function requireActiveAuthUser(): Promise<MutationGuardResult> {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: "未登入" };
  }

  const user = await getOptionalAuthUser();
  if (!user) {
    return { ok: false, error: "請先登入" };
  }

  const supabase = await createClient();
  const { data, error } = await (
    supabase as unknown as ModerationAccessRpcClient
  ).rpc("moderation_get_account_access_restriction", {
    p_user_id: user.id,
  });

  if (error) {
    console.error("[requireActiveAuthUser]", error.message);
    return { ok: false, error: "帳戶狀態無法驗證，請稍後再試" };
  }

  const restriction = data as AccountAccessRestriction | null;
  if (restriction?.blocked) {
    return { ok: false, error: "帳戶已受限，無法執行此操作" };
  }

  return { ok: true, user, supabase };
}
