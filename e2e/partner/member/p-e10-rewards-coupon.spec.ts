// @partner-id P-E10
// @features F-M-20, F-M-21
// @path Partner — TC-E10 rewards and order detail coupon UI

import { test, expect } from "@playwright/test";
import { getProfileIdByEmail } from "../../fixtures/supabase-admin";
import { hasBuyerAuthFixtures } from "../../fixtures/test-data";
import { ensureMemberPersona } from "../../helpers/collection-asset";
import {
  hasMerchantOrderE2eEnv,
  seedMerchantPendingPaymentOrder,
} from "../../helpers/merchant-orders";
import { dismissBlockingOverlays } from "../../helpers/overlays";

test.use({ viewport: { width: 1280, height: 900 } });
test.setTimeout(120_000);

test.describe("P-E10 rewards and order payment UI", () => {
  test("buyer rewards hub shows points store and coupon inventory", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "buyer", "Buyer-only rewards hub");
    test.skip(!hasBuyerAuthFixtures(), "Missing buyer auth fixtures");

    await ensureMemberPersona(page);
    await page.goto("/profile/user/rewards", { waitUntil: "domcontentloaded" });
    await dismissBlockingOverlays(page);

    await expect(page.getByText("可使用")).toBeVisible({
      timeout: 20_000,
    });
    await expect(
      page.getByRole("link", { name: /限時搶券.*積分商城/ }),
    ).toBeVisible({ timeout: 20_000 });
    await expect(
      page.getByRole("heading", { name: "我的優惠劵" }),
    ).toBeVisible({ timeout: 20_000 });

    await page.goto("/profile/user/campaigns", { waitUntil: "domcontentloaded" });
    await dismissBlockingOverlays(page);
    await expect(
      page.getByRole("heading", { name: "限時搶券 · 積分商城" }),
    ).toBeVisible({ timeout: 20_000 });
    await page.getByRole("button", { name: "積分商城" }).click();
    await expect(
      page
        .getByText("積分商城暫無可兌換商品")
        .or(page.getByRole("button", { name: "兌換" }).first())
        .or(page.getByText(/無法載入積分商城/)),
    ).toBeVisible({ timeout: 45_000 });
  });

  test("buyer merchant order detail shows payment amount row", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "buyer", "Buyer-only order detail");
    test.skip(
      !hasBuyerAuthFixtures() || !hasMerchantOrderE2eEnv(),
      "Missing buyer auth or merchant seed env",
    );

    const { orderId } = await seedMerchantPendingPaymentOrder();
    const buyerId = await getProfileIdByEmail(
      process.env.E2E_BUYER_EMAIL!.trim(),
    );
    expect(buyerId).toBeTruthy();

    await ensureMemberPersona(page);
    await page.goto(`/profile/user/orderDetail/${orderId}`, {
      waitUntil: "domcontentloaded",
    });
    await dismissBlockingOverlays(page);

    await expect(page.getByTestId("order-payment-amount")).toBeVisible({
      timeout: 20_000,
    });
    await expect(
      page.getByRole("link", { name: "返回交易管理" }),
    ).toBeVisible();
  });
});
