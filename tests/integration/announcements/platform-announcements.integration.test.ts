import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createPlatformAnnouncement,
  deletePlatformAnnouncement,
  getActiveAnnouncementsForDisplay,
  getAnnouncementsForAdmin,
  getAnnouncementsForPublicList,
  getHomeBannersForDisplay,
  togglePlatformAnnouncementActive,
  updatePlatformAnnouncement,
} from "@/app/actions/admin-announcements";
import { DEFAULT_ANNOUNCEMENT_POSTER_URL } from "@/lib/announcements/defaults";
import { getHktTodayDateString } from "@/lib/announcements/hkt-dates";
import {
  clearSessionCache,
  runAsAdmin,
  runAsBuyer,
  warmSession,
} from "../shared/auth-context";
import { hasBaseIntegrationEnv } from "../shared/env";
import { createServiceRoleClient } from "../shared/supabase-admin";

function shiftDateString(dateString: string, days: number): string {
  const [year, month, day] = dateString.split("-").map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, day + days));
  return shifted.toISOString().slice(0, 10);
}

describe.skipIf(!hasBaseIntegrationEnv()).sequential(
  "platform announcements SSOT integration",
  () => {
    const admin = createServiceRoleClient();
    const runId = String(Date.now());
    const initialTitle = `INTEGRATION_TEST_ANNOUNCEMENT_CRUD_${runId}`;
    const updatedTitle = `${initialTitle}_UPDATED`;

    let testAnnouncementId: string | null = null;
    let startDate = "";
    let endDate = "";

    beforeAll(async () => {
      await warmSession("buyer");
      await warmSession("admin");

      const today = getHktTodayDateString();
      startDate = shiftDateString(today, -1);
      endDate = shiftDateString(today, 30);
    });

    afterAll(async () => {
      if (testAnnouncementId) {
        await admin
          .from("platform_announcements")
          .delete()
          .eq("id", testAnnouncementId);
      }
      await clearSessionCache();
    });

    it("creates announcement via admin action", async () => {
      testAnnouncementId = randomUUID();

      await runAsAdmin(async () => {
        const result = await createPlatformAnnouncement({
          id: testAnnouncementId!,
          title: initialTitle,
          content: "Integration test announcement body for platform SSOT CRUD.",
          imageUrl: DEFAULT_ANNOUNCEMENT_POSTER_URL,
          startDate,
          endDate,
          isActive: true,
          priority: 999,
        });

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.id).toBe(testAnnouncementId);
        }
      });
    });

    it("lists created announcement for admin", async () => {
      expect(testAnnouncementId).toBeTruthy();

      await runAsAdmin(async () => {
        const result = await getAnnouncementsForAdmin();
        expect(result.success).toBe(true);
        if (result.success) {
          expect(
            result.data.some((item) => item.id === testAnnouncementId),
          ).toBe(true);
        }
      });
    });

    it("includes announcement in active display list for buyers", async () => {
      expect(testAnnouncementId).toBeTruthy();

      await runAsBuyer(async () => {
        const result = await getActiveAnnouncementsForDisplay();
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.some((item) => item.id === testAnnouncementId)).toBe(
            true,
          );
        }
      });
    });

    it("includes announcement in public list for buyers", async () => {
      expect(testAnnouncementId).toBeTruthy();

      await runAsBuyer(async () => {
        const result = await getAnnouncementsForPublicList();
        expect(result.success).toBe(true);
        if (result.success) {
          expect(
            result.data.some((item) => item.title === initialTitle),
          ).toBe(true);
        }
      });
    });

    it("updates announcement title via admin action", async () => {
      expect(testAnnouncementId).toBeTruthy();

      await runAsAdmin(async () => {
        const result = await updatePlatformAnnouncement(testAnnouncementId!, {
          title: updatedTitle,
          content: "Integration test announcement body for platform SSOT CRUD.",
          imageUrl: DEFAULT_ANNOUNCEMENT_POSTER_URL,
          startDate,
          endDate,
          isActive: true,
          priority: 999,
        });

        expect(result.success).toBe(true);
      });

      await runAsBuyer(async () => {
        const result = await getAnnouncementsForPublicList();
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.some((item) => item.title === updatedTitle)).toBe(
            true,
          );
        }
      });
    });

    it("excludes out-of-window announcement from active display list", async () => {
      expect(testAnnouncementId).toBeTruthy();

      await runAsAdmin(async () => {
        const outOfWindowStart = shiftDateString(getHktTodayDateString(), -60);
        const outOfWindowEnd = shiftDateString(getHktTodayDateString(), -30);
        const updateResult = await updatePlatformAnnouncement(testAnnouncementId!, {
          title: updatedTitle,
          content: "Integration test announcement body for platform SSOT CRUD.",
          imageUrl: DEFAULT_ANNOUNCEMENT_POSTER_URL,
          startDate: outOfWindowStart,
          endDate: outOfWindowEnd,
          isActive: true,
          priority: 999,
        });
        expect(updateResult.success).toBe(true);
      });

      await runAsBuyer(async () => {
        const result = await getActiveAnnouncementsForDisplay();
        expect(result.success).toBe(true);
        if (result.success) {
          expect(
            result.data.some((item) => item.id === testAnnouncementId),
          ).toBe(false);
        }
      });
    });

    it("excludes toggled-off announcement from active list", async () => {
      expect(testAnnouncementId).toBeTruthy();

      await runAsAdmin(async () => {
        const toggleResult = await togglePlatformAnnouncementActive(
          testAnnouncementId!,
        );
        expect(toggleResult.success).toBe(true);
      });

      await runAsBuyer(async () => {
        const result = await getActiveAnnouncementsForDisplay();
        expect(result.success).toBe(true);
        if (result.success) {
          expect(
            result.data.some((item) => item.id === testAnnouncementId),
          ).toBe(false);
        }
      });
    });

    it("excludes banner-only item from announcements but includes in home banners", async () => {
      const bannerOnlyId = randomUUID();
      const bannerTitle = `INTEGRATION_TEST_BANNER_ONLY_${runId}`;

      await runAsAdmin(async () => {
        const result = await createPlatformAnnouncement({
          id: bannerOnlyId,
          title: bannerTitle,
          content: "",
          imageUrl: DEFAULT_ANNOUNCEMENT_POSTER_URL,
          startDate,
          endDate,
          isActive: true,
          priority: 998,
          showOnHomeBanner: true,
          showInAnnouncements: false,
        });
        expect(result.success).toBe(true);
      });

      await runAsBuyer(async () => {
        const activeResult = await getActiveAnnouncementsForDisplay();
        expect(activeResult.success).toBe(true);
        if (activeResult.success) {
          expect(
            activeResult.data.some((item) => item.id === bannerOnlyId),
          ).toBe(false);
        }

        const listResult = await getAnnouncementsForPublicList();
        expect(listResult.success).toBe(true);
        if (listResult.success) {
          expect(
            listResult.data.some((item) => item.id === bannerOnlyId),
          ).toBe(false);
        }

        const bannerResult = await getHomeBannersForDisplay();
        expect(bannerResult.success).toBe(true);
        if (bannerResult.success) {
          expect(
            bannerResult.data.some((item) => item.id === bannerOnlyId),
          ).toBe(true);
        }
      });

      await runAsAdmin(async () => {
        const deleteResult = await deletePlatformAnnouncement(bannerOnlyId);
        expect(deleteResult.success).toBe(true);
      });
    });

    it("deletes announcement via admin action", async () => {
      expect(testAnnouncementId).toBeTruthy();

      await runAsAdmin(async () => {
        const deleteResult = await deletePlatformAnnouncement(
          testAnnouncementId!,
        );
        expect(deleteResult.success).toBe(true);

        const listResult = await getAnnouncementsForAdmin();
        expect(listResult.success).toBe(true);
        if (listResult.success) {
          expect(
            listResult.data.some((item) => item.id === testAnnouncementId),
          ).toBe(false);
        }
      });

      testAnnouncementId = null;
    });
  },
);
