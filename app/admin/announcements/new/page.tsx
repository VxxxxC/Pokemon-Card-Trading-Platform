import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AnnouncementForm } from "@/app/admin/announcements/AnnouncementForm";
import { getAnnouncementsForAdmin } from "@/app/actions/admin-announcements";
import { isCurrentUserAdmin } from "@/lib/auth/require-admin";
import { getOptionalAuthUser } from "@/lib/auth/session";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "新增公告 — HKCardVault 後台",
  description: "建立平台公告或首頁 Banner",
};

export default async function AdminNewAnnouncementPage() {
  if (!isSupabaseConfigured()) {
    redirect("/auth");
  }

  const user = await getOptionalAuthUser();
  if (!user) {
    redirect("/auth");
  }

  const supabase = await createClient();
  const isAdmin = await isCurrentUserAdmin(supabase, user.id);
  if (!isAdmin) {
    redirect("/");
  }

  const listResult = await getAnnouncementsForAdmin();
  const defaultPriority =
    listResult.success ? listResult.data.length + 1 : 1;

  return (
    <AnnouncementForm
      mode="create"
      pageTitle="新增公告"
      defaultPriority={defaultPriority}
    />
  );
}
