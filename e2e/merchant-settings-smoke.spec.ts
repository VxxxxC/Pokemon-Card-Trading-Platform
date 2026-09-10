import { test, expect } from "@playwright/test";
import { hasMemberTradingFixtures } from "./fixtures/test-data";

test.use({ viewport: { width: 1280, height: 900 } });
test.setTimeout(120_000);

test.describe("Merchant settings smoke (F-C-05)", () => {
  test("seller settings page loads shop profile form", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "seller", "Seller-only merchant settings");
    if (!hasMemberTradingFixtures()) {
      test.skip(true, "Missing seller auth fixtures");
    }

    await page.goto("/profile/merchant/settings", { waitUntil: "domcontentloaded" });

    await expect(
      page.getByRole("heading", { name: "店舖安全與設定中心" }),
    ).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("heading", { name: "店舖資料" })).toBeVisible();
    await expect(page.getByText("店舖名稱", { exact: true })).toBeVisible();
    await expect(page.getByText("店舖帳號 (Handle)", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "安全設定" })).toBeVisible();
  });
});
