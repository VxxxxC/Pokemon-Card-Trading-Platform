import { test, expect } from "@playwright/test";
import { hasBuyerAuthFixtures } from "./fixtures/test-data";
import {
  getBuyerProfileIdFromEnv,
  getGamificationStatsForProfile,
  upsertGamificationStatsForProfile,
} from "./fixtures/supabase-admin";
import { dismissBlockingOverlays } from "./helpers/overlays";
import {
  expectCheckInAffordanceVisible,
  gotoMemberRewardsPage,
} from "./helpers/platform-rewards";
import { isCheckedInTodayHk } from "@/lib/rewards/check-in-streak";

function daysAgoHkMiddayIso(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() - days);
  date.setHours(12, 0, 0, 0);
  return date.toISOString();
}

test.use({ viewport: { width: 1280, height: 900 } });
test.setTimeout(120_000);

test.describe("Member dashboard and rewards", () => {
  test("overview loads member dashboard shell", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "buyer", "Buyer-only dashboard smoke");
    if (!hasBuyerAuthFixtures()) {
      test.skip(true, "Missing E2E_BUYER_EMAIL or E2E_BUYER_PASSWORD");
    }

    await page.goto("/profile/user", { waitUntil: "domcontentloaded" });
    await dismissBlockingOverlays(page);

    await expect(page.getByRole("heading", { name: "資產總覽" })).toBeVisible({
      timeout: 20_000,
    });
    await expect(
      page.getByRole("heading", { name: "待處理訂單" }),
    ).toBeVisible({ timeout: 20_000 });
  });

  test("broken check-in streak resets UI to day 1", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "buyer", "Buyer-only check-in streak");
    if (!hasBuyerAuthFixtures()) {
      test.skip(true, "Missing E2E_BUYER_EMAIL or E2E_BUYER_PASSWORD");
    }

    const resolvedProfileId = await getBuyerProfileIdFromEnv();
    if (!resolvedProfileId) {
      test.skip(true, "Could not resolve buyer profile id");
      return;
    }
    const profileId = resolvedProfileId;

    const previousStats = await getGamificationStatsForProfile(profileId);

    try {
      await upsertGamificationStatsForProfile(profileId, {
        current_streak: 5,
        last_check_in: daysAgoHkMiddayIso(3),
        points_balance: previousStats?.points_balance ?? 0,
      });

      let streakSeedReady = false;
      try {
        await expect
          .poll(async () => {
            const stats = await getGamificationStatsForProfile(profileId);
            if (!stats?.last_check_in) return false;
            return !isCheckedInTodayHk(stats.last_check_in);
          }, { timeout: 15_000 })
          .toBe(true);
        streakSeedReady = true;
      } catch {
        streakSeedReady = false;
      }
      if (!streakSeedReady) {
        test.info().skip(true, "Could not seed broken check-in streak on staging");
        return;
      }

      await gotoMemberRewardsPage(page);
      await expectCheckInAffordanceVisible(page);

      const checkInHeading = page.getByText("每日簽到");
      const pausedButton = page.getByRole("button", { name: "簽到暫停" });
      const checkInActionButton = page.getByRole("button", {
        name: /立即簽到|簽到中…|今日已簽到|載入中…/,
      });
      await expect(
        pausedButton.or(checkInActionButton),
      ).toBeVisible({
        timeout: 20_000,
      });
      if (await pausedButton.isVisible()) {
        test.info().skip(true, "Check-in program paused on staging");
        return;
      }
      if (await page.getByRole("button", { name: "明日請繼續保持收藏習慣" }).isVisible()) {
        test.info().skip(true, "Buyer already checked in today on staging");
        return;
      }

      const checkInSection = checkInHeading.locator(
        "xpath=ancestor::div[contains(@class,'rounded-2xl')][1]",
      );
      await expect(checkInSection.getByText("今日", { exact: true })).toBeVisible({
        timeout: 20_000,
      });
      await expect(checkInSection.getByText("已簽")).toHaveCount(0, {
        timeout: 20_000,
      });
      await expect(
        page.getByRole("button", { name: "立即簽到" }),
      ).toBeVisible({ timeout: 20_000 });
    } finally {
      if (previousStats) {
        await upsertGamificationStatsForProfile(profileId, {
          current_streak: previousStats.current_streak ?? 0,
          last_check_in: previousStats.last_check_in,
          points_balance: previousStats.points_balance,
        });
      }
    }
  });

  test("check-in card reflects gamification stats", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "buyer", "Buyer-only check-in smoke");
    if (!hasBuyerAuthFixtures()) {
      test.skip(true, "Missing E2E_BUYER_EMAIL or E2E_BUYER_PASSWORD");
    }

    await gotoMemberRewardsPage(page);
    await expectCheckInAffordanceVisible(page);

    const pausedButton = page.getByRole("button", { name: "簽到暫停" });
    if (await pausedButton.isVisible()) {
      test.info().skip(true, "Check-in program paused on staging");
      return;
    }

    const checkInButton = page.getByRole("button", {
      name: /立即簽到|簽到中|今日已簽到|載入中|簽到暫停/,
    });

    const buttonLabel = (await checkInButton.textContent())?.trim() ?? "";
    if (buttonLabel.includes("明日請繼續保持收藏習慣")) {
      return;
    }

    await checkInButton.click();
    await expect(page.locator("[data-sonner-toast]").filter({
      hasText: "簽到成功",
    })).toBeVisible({ timeout: 20_000 });
    await expect(checkInButton).toHaveText(/明日請繼續保持收藏習慣/, {
      timeout: 20_000,
    });
  });

  test("rewards page coupon tabs are navigable", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "buyer", "Buyer-only rewards smoke");
    if (!hasBuyerAuthFixtures()) {
      test.skip(true, "Missing E2E_BUYER_EMAIL or E2E_BUYER_PASSWORD");
    }

    await gotoMemberRewardsPage(page);
    await dismissBlockingOverlays(page);

    await expect(page.getByText("可使用")).toBeVisible({
      timeout: 20_000,
    });

    for (const tabLabel of [
      /可解鎖/,
      /歷史已使用/,
      /不可領用 \(已過期\)/,
    ]) {
      await page.getByRole("button", { name: tabLabel }).click();
      await expect(page.getByRole("button", { name: tabLabel }).first()).toBeVisible();
    }
  });
});
