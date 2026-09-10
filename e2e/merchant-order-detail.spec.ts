import { test, expect } from "@playwright/test";
import { hasMemberTradingFixtures } from "./fixtures/test-data";
import {
  hasMerchantOrderE2eEnv,
  seedMerchantShippedOrderForSellerDetail,
} from "./helpers/merchant-orders";

test.use({ viewport: { width: 1280, height: 900 } });
test.setTimeout(120_000);

test.describe("Merchant order detail (F-C-11)", () => {
  test("seller sees not-found for invalid order id", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "seller", "Seller-only merchant order detail");
    if (!hasMemberTradingFixtures()) {
      test.skip(true, "Missing seller auth fixtures");
    }

    await page.goto("/profile/merchant/orderDetail/ORD-2099-ZZZZZZ", {
      waitUntil: "domcontentloaded",
    });

    await expect(page.getByText("找不到指定的交易訂單記錄")).toBeVisible({
      timeout: 20_000,
    });
    await expect(
      page.getByRole("link", { name: "返回交易管理" }),
    ).toBeVisible();
  });

  test("seller opens seeded shipped order detail", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "seller", "Seller-only merchant order detail");
    if (!hasMemberTradingFixtures() || !hasMerchantOrderE2eEnv()) {
      test.skip(true, "Missing seller auth or Supabase seed env");
    }

    const { orderId } = await seedMerchantShippedOrderForSellerDetail();

    await page.goto(`/profile/merchant/orderDetail/${orderId}`, {
      waitUntil: "domcontentloaded",
    });

    await expect(page.getByText("訂單號碼", { exact: true })).toBeVisible({
      timeout: 20_000,
    });
    await expect(
      page.getByText(/已提交物流單號|等待買家確認收貨/).first(),
    ).toBeVisible();
  });
});
