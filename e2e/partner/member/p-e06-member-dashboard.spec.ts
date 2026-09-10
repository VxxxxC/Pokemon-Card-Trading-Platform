// @partner-id P-E06
// @features F-M-09, F-M-20
// @path Partner — TC-E06 member dashboard

import { test, expect } from "@playwright/test";
import { hasBuyerAuthFixtures } from "../../fixtures/test-data";
import { dismissBlockingOverlays } from "../../helpers/overlays";

test.use({ viewport: { width: 1280, height: 900 } });
test.setTimeout(120_000);

test.describe("P-E06 member dashboard", () => {
  test("dashboard overview and rewards hub load", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "buyer", "Buyer dashboard journey");
    test.skip(!hasBuyerAuthFixtures(), "Missing buyer auth fixtures");

    await page.goto("/profile/user", { waitUntil: "domcontentloaded" });
    await dismissBlockingOverlays(page);
    await expect(page.getByText("帳戶總積分餘額")).toBeVisible({
      timeout: 20_000,
    });
    await expect(
      page.getByRole("heading", { name: "待處理訂單" }),
    ).toBeVisible({ timeout: 20_000 });

    await page.goto("/profile/user/rewards", { waitUntil: "domcontentloaded" });
    await dismissBlockingOverlays(page);
    await expect(
      page.getByRole("heading", { name: "會員獎勵與任務中心" }),
    ).toBeVisible({ timeout: 20_000 });
  });
});
