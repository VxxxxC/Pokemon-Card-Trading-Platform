import type { User } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { getOptionalAuthUser } from "@/lib/auth/session";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import type { createClient } from "@/lib/supabase/server";
import { createClient as createServerClient } from "@/lib/supabase/server";

type ServerSupabaseClient = Awaited<ReturnType<typeof createClient>>;

type ProfileRoleRow = {
  role: string | null;
};

export type AdminPageAccessDecision =
  | { allow: true; user: User }
  | { allow: false; redirectTo: "/auth" | "/" };

/**
 * Pure decision helper for admin layout SSR guard (unit-testable).
 */
export function resolveAdminPageAccess(input: {
  configured: boolean;
  user: User | null;
  isAdmin: boolean;
}): AdminPageAccessDecision {
  if (!input.configured || !input.user) {
    return { allow: false, redirectTo: "/auth" };
  }

  if (!input.isAdmin) {
    return { allow: false, redirectTo: "/" };
  }

  return { allow: true, user: input.user };
}

/**
 * Server-side admin layout gate — do not rely on proxy.ts alone.
 * Redirects unauthenticated users to /auth and non-admins to /.
 */
export async function requireAdminPageAccess(): Promise<User> {
  if (!isSupabaseConfigured()) {
    redirect("/auth");
  }

  const user = await getOptionalAuthUser();
  if (!user) {
    redirect("/auth");
  }

  const supabase = await createServerClient();
  const adminDecision = resolveAdminPageAccess({
    configured: true,
    user,
    isAdmin: await isCurrentUserAdmin(supabase, user.id),
  });

  if (!adminDecision.allow) {
    redirect(adminDecision.redirectTo);
  }

  return adminDecision.user;
}

/**
 * 判斷目前登入者是否為平台管理員 (profiles.role === 'admin')。
 */
export async function isCurrentUserAdmin(
  supabase: ServerSupabaseClient,
  userId: string,
): Promise<boolean> {
  if (!userId) {
    return false;
  }

  const { data, error } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle<ProfileRoleRow>();

  if (error) {
    console.error("[isCurrentUserAdmin]", error.message);
    return false;
  }

  return data?.role === "admin";
}
