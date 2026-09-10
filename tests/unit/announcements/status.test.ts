import { describe, expect, it } from "vitest";
import {
  getActiveAnnouncements,
  getAnnouncementStatus,
} from "@/lib/announcements/status";
import type { PlatformAnnouncement } from "@/lib/announcements/types";

function buildAnnouncement(
  overrides: Partial<PlatformAnnouncement> = {},
): PlatformAnnouncement {
  return {
    id: "test-id",
    title: "Test announcement",
    content: "Body",
    imageUrl: "https://example.com/poster.jpg",
    startDate: "2026-08-01",
    endDate: "2026-08-31",
    isActive: true,
    priority: 0,
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("announcement status", () => {
  const now = new Date("2026-08-12T12:00:00.000Z");

  it("returns inactive when isActive is false", () => {
    const status = getAnnouncementStatus(
      buildAnnouncement({ isActive: false }),
      now,
    );
    expect(status.code).toBe("inactive");
    expect(status.label).toBe("已下架");
  });

  it("returns upcoming before start date", () => {
    const status = getAnnouncementStatus(
      buildAnnouncement({
        startDate: "2026-08-20",
        endDate: "2026-08-31",
      }),
      now,
    );
    expect(status.code).toBe("upcoming");
    expect(status.label).toBe("未開始");
  });

  it("returns expired after end date", () => {
    const status = getAnnouncementStatus(
      buildAnnouncement({
        startDate: "2026-07-01",
        endDate: "2026-08-01",
      }),
      now,
    );
    expect(status.code).toBe("expired");
    expect(status.label).toBe("已過期");
  });

  it("returns active within date window", () => {
    const status = getAnnouncementStatus(
      buildAnnouncement({
        startDate: "2026-08-01",
        endDate: "2026-08-31",
      }),
      now,
    );
    expect(status.code).toBe("active");
    expect(status.label).toBe("進行中");
  });

  it("sorts active announcements by createdAt desc", () => {
    const announcements = [
      buildAnnouncement({
        id: "a",
        priority: 2,
        createdAt: "2026-08-01T00:00:00.000Z",
        startDate: "2026-08-01",
        endDate: "2026-08-31",
      }),
      buildAnnouncement({
        id: "b",
        priority: 1,
        createdAt: "2026-08-02T00:00:00.000Z",
        startDate: "2026-08-01",
        endDate: "2026-08-31",
      }),
      buildAnnouncement({
        id: "c",
        priority: 1,
        createdAt: "2026-08-03T00:00:00.000Z",
        startDate: "2026-08-01",
        endDate: "2026-08-31",
      }),
    ];

    const active = getActiveAnnouncements(announcements, now);
    expect(active.map((item) => item.id)).toEqual(["c", "b", "a"]);
  });

  it("excludes expired announcements from active list even when isActive is true", () => {
    const announcements = [
      buildAnnouncement({
        id: "active",
        startDate: "2026-08-01",
        endDate: "2026-08-31",
      }),
      buildAnnouncement({
        id: "expired",
        startDate: "2026-07-01",
        endDate: "2026-08-01",
        isActive: true,
      }),
    ];

    const active = getActiveAnnouncements(announcements, now);
    expect(active.map((item) => item.id)).toEqual(["active"]);
  });
});
