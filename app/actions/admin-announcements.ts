"use server";

import { isCurrentUserAdmin } from "@/lib/auth/require-admin";
import { getOptionalAuthUser } from "@/lib/auth/session";
import { getHktTodayDateString } from "@/lib/announcements/hkt-dates";
import { sortAnnouncementsForAdmin, sortAnnouncementsForPublicDisplay } from "@/lib/announcements/status";
import {
  mapAnnouncementRow,
  mapAnnouncementToDbRow,
  type PlatformAnnouncement,
  type PlatformAnnouncementInput,
} from "@/lib/announcements/types";
import { validateAnnouncementInput } from "@/lib/announcements/validation";
import { mapAnnouncementToHomeBannerItem } from "@/lib/announcements/map-home-banner";
import type { HomeBannerItem } from "@/app/lib/home/types";
import { deleteAnnouncementPosterFromBunny } from "@/lib/storage/bunny";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/supabase";

type AnnouncementRow = Database["public"]["Tables"]["platform_announcements"]["Row"];

type AnnouncementListResult =
  | { success: true; data: PlatformAnnouncement[] }
  | { success: false; error: string };

type AnnouncementMutationResult =
  | { success: true; data: PlatformAnnouncement }
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

type AnnouncementSurfaceFilter = "home_banner" | "announcements" | "all";

async function readAnnouncements(
  useAdminClient: boolean,
  options?: { activeOnly?: boolean; surface?: AnnouncementSurfaceFilter },
): Promise<PlatformAnnouncement[]> {
  const today = getHktTodayDateString();
  const surface = options?.surface ?? "all";

  if (useAdminClient) {
    const admin = createAdminClient();
    let query = admin
      .from("platform_announcements")
      .select("*")
      .order("priority", { ascending: true })
      .order("created_at", { ascending: false });

    if (options?.activeOnly) {
      query = query
        .eq("is_active", true)
        .lte("start_date", today)
        .gte("end_date", today);
    }

    if (surface === "home_banner") {
      query = query.eq("show_on_home_banner", true);
    } else if (surface === "announcements") {
      query = query.eq("show_in_announcements", true);
    }

    const { data, error } = await query;

    if (error) {
      console.error("[readAnnouncements]", error.message);
      return [];
    }

    return (data ?? []).map((row) => mapAnnouncementRow(row));
  }

  const supabase = await createClient();
  let query = supabase
    .from("platform_announcements")
    .select("*")
    .order("created_at", { ascending: false });

  if (options?.activeOnly) {
    query = query
      .eq("is_active", true)
      .lte("start_date", today)
      .gte("end_date", today);
  }

  if (surface === "home_banner") {
    query = query.eq("show_on_home_banner", true);
  } else if (surface === "announcements") {
    query = query.eq("show_in_announcements", true);
  }

  const { data, error } = await query;

  if (error) {
    console.error("[readAnnouncements]", error.message);
    return [];
  }

  return (data ?? []).map((row) => mapAnnouncementRow(row as AnnouncementRow));
}

export async function getActiveAnnouncementsForDisplay(): Promise<AnnouncementListResult> {
  if (!isSupabaseConfigured()) {
    return { success: true, data: [] };
  }

  const data = await readAnnouncements(false, {
    activeOnly: true,
    surface: "announcements",
  });
  return { success: true, data: sortAnnouncementsForPublicDisplay(data) };
}

type HomeBannerListResult =
  | { success: true; data: HomeBannerItem[] }
  | { success: false; error: string };

export async function getHomeBannersForDisplay(): Promise<HomeBannerListResult> {
  if (!isSupabaseConfigured()) {
    return { success: true, data: [] };
  }

  const data = await readAnnouncements(false, {
    activeOnly: true,
    surface: "home_banner",
  });
  return {
    success: true,
    data: sortAnnouncementsForPublicDisplay(data).map(
      mapAnnouncementToHomeBannerItem,
    ),
  };
}

export async function getAnnouncementsForPublicList(): Promise<AnnouncementListResult> {
  if (!isSupabaseConfigured()) {
    return { success: true, data: [] };
  }

  const data = await readAnnouncements(false, { surface: "announcements" });
  return { success: true, data: sortAnnouncementsForPublicDisplay(data) };
}

export async function getAnnouncementsForAdmin(): Promise<AnnouncementListResult> {
  const guard = await requireAdmin();
  if (!guard.ok) {
    return { success: false, error: guard.error };
  }

  const data = sortAnnouncementsForAdmin(await readAnnouncements(true));
  return { success: true, data };
}

export async function createPlatformAnnouncement(
  input: PlatformAnnouncementInput & { id?: string },
): Promise<AnnouncementMutationResult> {
  const guard = await requireAdmin();
  if (!guard.ok) {
    return { success: false, error: guard.error };
  }

  const validationError = validateAnnouncementInput(input);
  if (validationError) {
    return { success: false, error: validationError };
  }

  const admin = createAdminClient();
  const row = mapAnnouncementToDbRow(input, guard.adminId);
  const insertRow = input.id ? { id: input.id, ...row } : row;

  const { data, error } = await admin
    .from("platform_announcements")
    .insert(insertRow)
    .select("*")
    .single();

  if (error || !data) {
    console.error("[createPlatformAnnouncement]", error?.message);
    return { success: false, error: "無法新增公告" };
  }

  return { success: true, data: mapAnnouncementRow(data as AnnouncementRow) };
}

export async function updatePlatformAnnouncement(
  id: string,
  input: PlatformAnnouncementInput,
): Promise<AnnouncementMutationResult> {
  const guard = await requireAdmin();
  if (!guard.ok) {
    return { success: false, error: guard.error };
  }

  const validationError = validateAnnouncementInput(input);
  if (validationError) {
    return { success: false, error: validationError };
  }

  const admin = createAdminClient();
  const { data: existing, error: readError } = await admin
    .from("platform_announcements")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (readError || !existing) {
    return { success: false, error: "找不到公告" };
  }

  const existingRow = existing as AnnouncementRow;
  const nextObjectKey = input.imageObjectKey ?? null;
  const previousObjectKey = existingRow.image_object_key;

  const { data, error } = await admin
    .from("platform_announcements")
    .update({
      title: input.title.trim(),
      content: input.content.trim(),
      image_url: input.imageUrl.trim(),
      image_object_key: nextObjectKey,
      link_url: input.linkUrl?.trim() || null,
      start_date: input.startDate,
      end_date: input.endDate,
      is_active: input.isActive,
      priority: input.priority ?? existingRow.priority,
      show_on_home_banner: input.showOnHomeBanner ?? false,
      show_in_announcements: input.showInAnnouncements ?? true,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select("*")
    .single();

  if (error || !data) {
    console.error("[updatePlatformAnnouncement]", error?.message);
    return { success: false, error: "無法更新公告" };
  }

  if (
    previousObjectKey &&
    previousObjectKey !== nextObjectKey
  ) {
    await deleteAnnouncementPosterFromBunny(previousObjectKey);
  }

  return { success: true, data: mapAnnouncementRow(data as AnnouncementRow) };
}

export async function deletePlatformAnnouncement(
  id: string,
): Promise<{ success: true } | { success: false; error: string }> {
  const guard = await requireAdmin();
  if (!guard.ok) {
    return { success: false, error: guard.error };
  }

  const admin = createAdminClient();
  const { data: existing, error: readError } = await admin
    .from("platform_announcements")
    .select("image_object_key")
    .eq("id", id)
    .maybeSingle();

  if (readError) {
    return { success: false, error: "無法刪除公告" };
  }

  const { error } = await admin.from("platform_announcements").delete().eq("id", id);

  if (error) {
    console.error("[deletePlatformAnnouncement]", error.message);
    return { success: false, error: "無法刪除公告" };
  }

  if (existing?.image_object_key) {
    await deleteAnnouncementPosterFromBunny(existing.image_object_key);
  }

  return { success: true };
}

export async function togglePlatformAnnouncementActive(
  id: string,
): Promise<AnnouncementMutationResult> {
  const guard = await requireAdmin();
  if (!guard.ok) {
    return { success: false, error: guard.error };
  }

  const admin = createAdminClient();
  const { data: existing, error: readError } = await admin
    .from("platform_announcements")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (readError || !existing) {
    return { success: false, error: "找不到公告" };
  }

  const existingRow = existing as AnnouncementRow;
  const { data, error } = await admin
    .from("platform_announcements")
    .update({
      is_active: !existingRow.is_active,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select("*")
    .single();

  if (error || !data) {
    console.error("[togglePlatformAnnouncementActive]", error?.message);
    return { success: false, error: "無法更新公告狀態" };
  }

  return { success: true, data: mapAnnouncementRow(data as AnnouncementRow) };
}
