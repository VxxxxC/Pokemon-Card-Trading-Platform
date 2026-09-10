// @partner-id P-E05
// @features F-M-07, F-C-03
// @path Partner — TC-E05 merchant buy-now UI

import { test, expect } from "@playwright/test";
import { resolveE2eMarketplaceFixture } from "../../fixtures/supabase-admin";
import {
  buildMerchantProductDetailPath,
  hasBuyerAuthFixtures,
  hasCoreMerchantFixtures,
} from "../../fixtures/test-data";
import { dismissBlockingOverlays } from "../../helpers/overlays";

test.use({ viewport: { width: 1280, height: 900 } });
test.setTimeout(120_000);

async function openMerchantProductDetail(
  page: import("@playwright/test").Page,
): Promise<boolean> {
  if (!hasCoreMerchantFixtures()) {
    test.skip(true, "Missing E2E_SELLER_ID or E2E_LISTING_ID");
    return false;
  }

  const result = await resolveE2eMarketplaceFixture();
  if (!result.ok) {
    test.skip(true, result.skipReason);
    return false;
  }

  const { sellerId, listingId } = result.fixture;
  await page.goto(buildMerchantProductDetailPath(sellerId, listingId), {
    waitUntil: "domcontentloaded",
  });
  await dismissBlockingOverlays(page);
  await expect(page.locator("main h1")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("店主獨立出讓一口價")).toBeVisible({
    timeout: 15_000,
  });
  return true;
}

test.describe("P-E05 merchant buy-now UI", () => {
  test("guest buy button shows login slide-over", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "guest", "Guest buy-now guard");
    if (!(await openMerchantProductDetail(page))) return;

    await page.getByRole("button", { name: /立即購買/ }).click();
    await expect(page.getByText("登入後方可交易")).toBeVisible();
    await expect(page.getByRole("alertdialog")).toContainText("登入 / 註冊");
  });

  test("buyer buy button opens confirm dialog", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "buyer", "Buyer buy-now dialog");
    test.skip(!hasBuyerAuthFixtures(), "Missing buyer auth fixtures");
    if (!(await openMerchantProductDetail(page))) return;

    await page.getByRole("button", { name: /立即購買/ }).click();
    await expect(page.getByText("登入後方可交易")).toHaveCount(0);
    await expect(
      page.getByRole("heading", { name: "確認立即購買" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "確認立即購買" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "取消" }).click();
    await expect(
      page.getByRole("heading", { name: "確認立即購買" }),
    ).toHaveCount(0);
  });
});
