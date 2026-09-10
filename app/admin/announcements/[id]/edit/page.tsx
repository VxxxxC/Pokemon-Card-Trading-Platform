import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { AnnouncementForm } from "@/app/admin/announcements/AnnouncementForm";
import { getAnnouncementsForAdmin } from "@/app/actions/admin-announcements";
import { isCurrentUserAdmin } from "@/lib/auth/require-admin";
import { getOptionalAuthUser } from "@/lib/auth/session";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

type AdminEditAnnouncementPageProps = {
  params: Promise<{ id: string }>;
};

export async function generateMetadata({
  params,
}: AdminEditAnnouncementPageProps): Promise<Metadata> {
  const { id } = await params;
  return {
    title: `編輯公告 ${id.slice(0, 8)} — HKCardVault 後台`,
    description: "編輯平台公告或首頁 Banner",
  };
}

export default async function AdminEditAnnouncementPage({
  params,
}: AdminEditAnnouncementPageProps) {
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

  const { id } = await params;
  const result = await getAnnouncementsForAdmin();

  if (!result.success) {
    notFound();
  }

  const announcement = result.data.find((item) => item.id === id);
  if (!announcement) {
    notFound();
  }

  return (
    <AnnouncementForm
      mode="edit"
      pageTitle="編輯公告"
      announcement={announcement}
    />
  );
}
