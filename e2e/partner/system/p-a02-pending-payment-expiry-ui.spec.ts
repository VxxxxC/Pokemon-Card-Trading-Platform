// @partner-id P-A02
// @features F-S-12, F-C-11
// @path Partner

import { test, expect } from "@playwright/test";
import {
  hasMemberTradingFixtures,
  buildMerchantProductDetailPath,
} from "../../fixtures/test-data";
import { dismissBlockingOverlays } from "../../helpers/overlays";
import { ensureMemberPersona } from "../../helpers/collection-asset";
import {
  backdateMerchantOrderCreatedAt,
  expireMerchantPendingPaymentOrder,
  hasMerchantOrderE2eEnv,
  seedMerchantPendingPaymentOrder,
} from "../../helpers/merchant-orders";

test.use({ viewport: { width: 1280, height: 900 } });
test.setTimeout(180_000);

test.describe("P-A02 merchant pending-payment expiry UI", () => {
  test("after 48h expiry listing is buyable and both sides leave 待付款", async ({
    browser,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== "seller",
      "Buyer + seller expiry UI uses seller project",
    );
    test.skip(
      !hasMemberTradingFixtures() || !hasMerchantOrderE2eEnv(),
      "Missing seller auth or Supabase seed env",
    );

    const seeded = await seedMerchantPendingPaymentOrder();
    await backdateMerchantOrderCreatedAt(seeded.orderId, 49);
    await expireMerchantPendingPaymentOrder(seeded.orderId);

    const buyerContext = await browser.newContext({
      storageState: "e2e/.auth/buyer.json",
    });
    const sellerContext = await browser.newContext({
      storageState: "e2e/.auth/seller.json",
    });
    const buyerPage = await buyerContext.newPage();
    const sellerPage = await sellerContext.newPage();

    try {
      await buyerPage.goto(
        buildMerchantProductDetailPath(seeded.merchantId, seeded.listingId),
        { waitUntil: "domcontentloaded" },
      );
      await dismissBlockingOverlays(buyerPage);
      await expect(
        buyerPage.getByRole("button", { name: /立即購買/ }),
      ).toBeEnabled({ timeout: 20_000 });

      await ensureMemberPersona(buyerPage);
      await buyerPage.goto(`/profile/user/orderDetail/${seeded.orderId}`, {
        waitUntil: "domcontentloaded",
      });
      await dismissBlockingOverlays(buyerPage);
      await expect(
        buyerPage.getByText("此訂單付款期限已過，掛單已釋放。請返回市集重新下單。"),
      ).toBeVisible({ timeout: 20_000 });
      await expect(
        buyerPage.getByRole("button", { name: "前往付款" }),
      ).toHaveCount(0);

      await sellerPage.goto(`/profile/merchant/orderDetail/${seeded.orderId}`, {
        waitUntil: "domcontentloaded",
      });
      await dismissBlockingOverlays(sellerPage);
      await expect(
        sellerPage.getByText(/已取消|已退款|付款期限/).first(),
      ).toBeVisible({ timeout: 20_000 });
      await expect(
        sellerPage.getByText("等待買家完成託管付款，收款後方可安排出貨。"),
      ).toHaveCount(0);
    } finally {
      await buyerContext.close();
      await sellerContext.close();
    }
  });
});
