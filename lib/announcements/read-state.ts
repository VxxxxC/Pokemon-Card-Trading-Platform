import type { PlatformAnnouncement } from "@/lib/announcements/types";

const STORAGE_KEY = "hkcv-announcement-read-state";
export const ANNOUNCEMENT_READ_STATE_EVENT = "hkcv-announcements-read";

export type AnnouncementReadState = Record<string, string>;

export function readAnnouncementReadState(): AnnouncementReadState {
  if (typeof window === "undefined") {
    return {};
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return {};
    }

    const parsed = JSON.parse(raw) as AnnouncementReadState;
    if (typeof parsed !== "object" || parsed === null) {
      return {};
    }

    return parsed;
  } catch {
    return {};
  }
}

export function isAnnouncementUnread(
  announcement: PlatformAnnouncement,
  readState: AnnouncementReadState = readAnnouncementReadState(),
): boolean {
  const seenUpdatedAt = readState[announcement.id];
  if (!seenUpdatedAt) {
    return true;
  }

  return seenUpdatedAt < announcement.updatedAt;
}

export function hasUnreadAnnouncements(
  announcements: PlatformAnnouncement[],
): boolean {
  const readState = readAnnouncementReadState();
  return announcements.some((item) => isAnnouncementUnread(item, readState));
}

export function markAnnouncementsAsRead(
  announcements: PlatformAnnouncement[],
): void {
  if (typeof window === "undefined" || announcements.length === 0) {
    return;
  }

  const state = readAnnouncementReadState();
  for (const item of announcements) {
    state[item.id] = item.updatedAt;
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  window.dispatchEvent(new Event(ANNOUNCEMENT_READ_STATE_EVENT));
}
