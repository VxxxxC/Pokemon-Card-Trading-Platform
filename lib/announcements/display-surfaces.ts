import type { PlatformAnnouncement } from "@/lib/announcements/types";

export function getAnnouncementDisplaySurfaceLabel(
  item: Pick<PlatformAnnouncement, "showOnHomeBanner" | "showInAnnouncements">,
): string {
  if (item.showOnHomeBanner && item.showInAnnouncements) {
    return "兩邊";
  }
  if (item.showOnHomeBanner) {
    return "Banner";
  }
  return "公告";
}

export function getAnnouncementDisplaySurfaceBadgeClass(
  item: Pick<PlatformAnnouncement, "showOnHomeBanner" | "showInAnnouncements">,
): string {
  if (item.showOnHomeBanner && item.showInAnnouncements) {
    return "border-brand/30 bg-brand/10 text-brand";
  }
  if (item.showOnHomeBanner) {
    return "border-sky-400/30 bg-sky-400/10 text-sky-300";
  }
  return "border-white/10 bg-white/5 text-text-secondary";
}
