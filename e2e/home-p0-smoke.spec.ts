import { test, expect } from "@playwright/test";
import {
  expectCheckInAffordanceVisible,
  gotoMemberRewardsPage,
} from "./helpers/platform-rewards";
import { dismissBlockingOverlays } from "./helpers/member-trading";

test.use({ viewport: { width: 1280, height: 900 } });
test.setTimeout(60_000);

test.describe("Home P0 smoke (M5)", () => {
  test("guest home loads merchant and C2C sections", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "guest", "Guest-only smoke");

    await page.goto("/", { waitUntil: "domcontentloaded" });
    await dismissBlockingOverlays(page);
    await expect(page.locator("main")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByPlaceholder(/輸入卡牌編號/)).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText("認證商家・鑑定託管保障")).toBeVisible();
    await expect(page.getByText("最新會員現貨上架")).toBeVisible();
  });

  test("buyer home shows check-in affordance", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "buyer", "Buyer auth required");

    await gotoMemberRewardsPage(page);
    await expectCheckInAffordanceVisible(page);
  });
});
