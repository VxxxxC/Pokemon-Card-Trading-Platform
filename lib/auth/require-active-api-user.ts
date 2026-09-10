import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";

type AccountAccessRestriction = {
  blocked?: boolean;
};

type ModerationAccessRpcClient = {
  rpc(
    fn: "moderation_get_account_access_restriction",
    args: { p_user_id: string },
  ): Promise<{ data: unknown; error: { message: string } | null }>;
};

export type ApiAuthResult =
  | { ok: true; user: User }
  | { ok: false; status: number; error: string };

/**
 * API route auth gate: session + suspension check (fail-closed).
 */
export async function requireActiveApiUser(): Promise<ApiAuthResult> {
  if (!isSupabaseConfigured()) {
    return { ok: false, status: 503, error: "Service unavailable" };
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { ok: false, status: 401, error: "Unauthorized" };
  }

  const { data, error } = await (
    supabase as unknown as ModerationAccessRpcClient
  ).rpc("moderation_get_account_access_restriction", {
    p_user_id: user.id,
  });

  if (error) {
    console.error("[requireActiveApiUser]", error.message);
    return { ok: false, status: 403, error: "Account restriction check failed" };
  }

  const restriction = data as AccountAccessRestriction | null;
  if (restriction?.blocked) {
    return { ok: false, status: 403, error: "Account suspended" };
  }

  return { ok: true, user };
}
