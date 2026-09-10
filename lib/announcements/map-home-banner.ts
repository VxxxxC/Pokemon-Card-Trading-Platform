import type { HomeBannerItem } from "@/app/lib/home/types";
import type { PlatformAnnouncement } from "@/lib/announcements/types";

export function mapAnnouncementToHomeBannerItem(
  announcement: PlatformAnnouncement,
): HomeBannerItem {
  return {
    id: announcement.id,
    title: announcement.title,
    imageUrl: announcement.imageUrl,
    linkUrl: announcement.linkUrl,
    altText: announcement.title,
  };
}
