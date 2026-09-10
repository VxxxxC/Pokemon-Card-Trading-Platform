import { test, expect } from "@playwright/test";
import {
  getMerchantProductDetailFixtures,
  hasMemberTradingFixtures,
} from "./fixtures/test-data";

test.use({ viewport: { width: 1280, height: 900 } });
test.setTimeout(120_000);

test.describe("Merchant analytics & performance smoke (F-C-07)", () => {
  test("seller performance dashboard loads metrics shell", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "seller", "Seller-only performance");
    if (!hasMemberTradingFixtures()) {
      test.skip(true, "Missing seller auth fixtures");
    }

    await page.goto("/profile/merchant/performance", {
      waitUntil: "domcontentloaded",
    });

    await expect(page.getByText("歷史累計總營業額")).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByText("歷史累計總營業額")).toBeVisible();
    await expect(page.getByText("歷史累計平均單價")).toBeVisible();
    await expect(page.getByText("歷史累計總成交次數")).toBeVisible();
  });

  test("seller product analytics loads chart shell", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "seller", "Seller-only analytics");
    if (!hasMemberTradingFixtures()) {
      test.skip(true, "Missing seller auth fixtures");
    }

    const productId = getMerchantProductDetailFixtures().listingProductId;
    test.skip(!productId, "Missing E2E_LISTING_PRODUCT_ID for analytics");

    await page.goto(
      `/profile/merchant/analytics?productId=${encodeURIComponent(productId!)}`,
      { waitUntil: "domcontentloaded" },
    );

    await expect(page.getByText("平均成交價")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText("市場最低價")).toBeVisible();
    await expect(page.getByText("商品表現")).toBeVisible();
  });
});
