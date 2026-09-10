import { describe, expect, it, beforeEach, vi } from "vitest";
import type { PlatformAnnouncement } from "@/lib/announcements/types";
import {
  hasUnreadAnnouncements,
  isAnnouncementUnread,
  markAnnouncementsAsRead,
  readAnnouncementReadState,
} from "@/lib/announcements/read-state";

const baseAnnouncement: PlatformAnnouncement = {
  id: "ann-1",
  title: "Test",
  imageUrl: "https://example.com/poster.png",
  content: "Body",
  startDate: "2026-01-01",
  endDate: "2026-12-31",
  isActive: true,
  priority: 0,
  showOnHomeBanner: true,
  showInAnnouncements: true,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

describe("announcement read-state", () => {
  const storage = new Map<string, string>();

  beforeEach(() => {
    storage.clear();
    const localStorageMock = {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => {
        storage.set(key, value);
      },
      removeItem: (key: string) => {
        storage.delete(key);
      },
      key: (index: number) => [...storage.keys()][index] ?? null,
      get length() {
        return storage.size;
      },
      clear: () => storage.clear(),
    };

    vi.stubGlobal("localStorage", localStorageMock);
    vi.stubGlobal("window", {
      localStorage: localStorageMock,
      dispatchEvent: vi.fn(),
    });
  });

  it("treats unseen announcements as unread", () => {
    expect(isAnnouncementUnread(baseAnnouncement)).toBe(true);
    expect(hasUnreadAnnouncements([baseAnnouncement])).toBe(true);
  });

  it("clears unread after markAnnouncementsAsRead", () => {
    markAnnouncementsAsRead([baseAnnouncement]);

    expect(readAnnouncementReadState()[baseAnnouncement.id]).toBe(
      baseAnnouncement.updatedAt,
    );
    expect(hasUnreadAnnouncements([baseAnnouncement])).toBe(false);
  });

  it("re-shows unread when announcement is updated", () => {
    markAnnouncementsAsRead([baseAnnouncement]);

    const updated = {
      ...baseAnnouncement,
      updatedAt: "2026-02-01T00:00:00.000Z",
    };

    expect(hasUnreadAnnouncements([updated])).toBe(true);
  });
});
