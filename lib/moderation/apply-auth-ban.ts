import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

/** ~100 years — treated as permanent ban in Supabase Auth. */
const PERMANENT_BAN_DURATION = "876000h";

export type ApplyAuthBanResult =
  | { ok: true }
  | { ok: false; error: string };

export async function applySupabaseAuthBan(
  userId: string,
): Promise<ApplyAuthBanResult> {
  const trimmedUserId = userId.trim();
  if (!trimmedUserId) {
    return { ok: false, error: "無效的用戶 ID" };
  }

  try {
    const admin = createAdminClient();

    const { error: banError } = await admin.auth.admin.updateUserById(
      trimmedUserId,
      { ban_duration: PERMANENT_BAN_DURATION },
    );

    if (banError) {
      console.error("[applySupabaseAuthBan] updateUserById", banError.message);
      return { ok: false, error: banError.message };
    }

    const { error: signOutError } = await admin.auth.admin.signOut(
      trimmedUserId,
      "global",
    );

    if (signOutError) {
      console.error("[applySupabaseAuthBan] signOut", signOutError.message);
      return { ok: false, error: signOutError.message };
    }

    return { ok: true };
  } catch (error) {
    console.error("[applySupabaseAuthBan]", error);
    return { ok: false, error: "無法套用 Auth 封禁" };
  }
}
