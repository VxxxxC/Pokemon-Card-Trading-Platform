"use server";

import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/supabase";

type ActivityResult = { success: true } | { success: false; error: string };

type ProfileActivityUpdate =
  Database["public"]["Tables"]["profiles"]["Update"];

const MIN_TOUCH_INTERVAL_MS = 5 * 60 * 1000;

export async function touchUserLastActive(): Promise<ActivityResult> {
  if (!isSupabaseConfigured()) {
    return { success: false, error: "未登入" };
  }

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: "未登入" };
    }

    const { data: profile, error: readError } = await supabase
      .from("profiles")
      .select("last_active_at")
      .eq("id", user.id)
      .maybeSingle<{ last_active_at: string | null }>();

    if (readError) {
      console.error("[touchUserLastActive] read", readError.message);
      return { success: false, error: "無法更新活動狀態" };
    }

    const now = Date.now();
    if (profile?.last_active_at) {
      const lastMs = Date.parse(profile.last_active_at);
      if (Number.isFinite(lastMs) && now - lastMs < MIN_TOUCH_INTERVAL_MS) {
        return { success: true };
      }
    }

    const payload: ProfileActivityUpdate = {
      last_active_at: new Date(now).toISOString(),
      updated_at: new Date(now).toISOString(),
    };

    const profilesClient = supabase.from("profiles") as unknown as {
      update: (values: ProfileActivityUpdate) => {
        eq: (
          column: "id",
          value: string,
        ) => Promise<{ error: { message: string } | null }>;
      };
    };

    const { error: updateError } = await profilesClient
      .update(payload)
      .eq("id", user.id);

    if (updateError) {
      console.error("[touchUserLastActive] update", updateError.message);
      if (updateError.message.includes("last_active_at")) {
        return { success: false, error: "資料庫尚未更新，請聯絡管理員" };
      }
      return { success: false, error: "無法更新活動狀態" };
    }

    return { success: true };
  } catch (error) {
    console.error("[touchUserLastActive]", error);
    return { success: false, error: "無法更新活動狀態" };
  }
}
