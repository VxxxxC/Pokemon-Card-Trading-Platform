import {
  compareHktDateStrings,
  getHktTodayDateString,
  isAnnouncementInActiveWindow,
} from "@/lib/announcements/hkt-dates";
import type { PlatformAnnouncement } from "@/lib/announcements/types";

export type AnnouncementStatusCode =
  | "active"
  | "upcoming"
  | "expired"
  | "inactive";

export function getAnnouncementStatus(
  announcement: PlatformAnnouncement,
  now: Date = new Date(),
): {
  code: AnnouncementStatusCode;
  label: string;
  badgeClass: string;
} {
  if (!announcement.isActive) {
    return {
      code: "inactive",
      label: "已下架",
      badgeClass: "bg-neutral-800/80 text-text-secondary border-neutral-700",
    };
  }

  const today = getHktTodayDateString(now);

  if (compareHktDateStrings(today, announcement.startDate) < 0) {
    return {
      code: "upcoming",
      label: "未開始",
      badgeClass: "bg-amber-950/60 text-amber-300 border-amber-800/60",
    };
  }

  if (compareHktDateStrings(today, announcement.endDate) > 0) {
    return {
      code: "expired",
      label: "已過期",
      badgeClass: "bg-neutral-900/80 text-neutral-400 border-neutral-800",
    };
  }

  return {
    code: "active",
    label: "進行中",
    badgeClass: "bg-emerald-950/60 text-emerald-400 border-emerald-800/60",
  };
}

export function sortAnnouncementsForPublicDisplay(
  announcements: PlatformAnnouncement[],
): PlatformAnnouncement[] {
  return [...announcements].sort((a, b) => {
    const byCreated = b.createdAt.localeCompare(a.createdAt);
    if (byCreated !== 0) {
      return byCreated;
    }
    return a.priority - b.priority;
  });
}

export function getActiveAnnouncements(
  announcements: PlatformAnnouncement[],
  now: Date = new Date(),
): PlatformAnnouncement[] {
  return sortAnnouncementsForPublicDisplay(
    announcements.filter(
      (item) =>
        item.isActive &&
        isAnnouncementInActiveWindow(item.startDate, item.endDate, now),
    ),
  );
}

export function sortAnnouncementsForAdmin(
  announcements: PlatformAnnouncement[],
): PlatformAnnouncement[] {
  return [...announcements].sort((a, b) => {
    if (a.priority !== b.priority) {
      return a.priority - b.priority;
    }
    return b.createdAt.localeCompare(a.createdAt);
  });
}
