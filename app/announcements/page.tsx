import { getAnnouncementsForPublicList } from "@/app/actions/admin-announcements";
import { AnnouncementsPageClient } from "@/app/announcements/AnnouncementsPageClient";

export default async function PublicAnnouncementsPage() {
  const result = await getAnnouncementsForPublicList();
  const announcements = result.success ? result.data : [];

  return <AnnouncementsPageClient announcements={announcements} />;
}
