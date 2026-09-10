import { test, expect } from "@playwright/test";
import { getProfileIdByEmail } from "./fixtures/supabase-admin";
import {
  getMerchantProductDetailFixtures,
  hasBuyerAuthFixtures,
  hasCoreMerchantFixtures,
} from "./fixtures/test-data";
import {
  buyMerchantListingAndReachCheckout,
  completeMerchantDirectCheckout,
  findActiveFreeShippingTemplateId,
  findActiveMerchantListingForE2e,
  getMerchantOrderCouponSnapshot,
  grantUserRewardForE2e,
  reactivateListingForE2e,
} from "./helpers/platform-rewards";
import { hasStripeReconcileEnv } from "./helpers/stripe-reconcile";
import { ensureCourierShippingSelected } from "./helpers/rewards-checkout-coupon";

test.describe.configure({ mode: "serial" });
test.use({ viewport: { width: 1280, height: 900 } });
test.setTimeout(300_000);

test.describe("Rewards order detail — buyer paid amount", () => {
  test("E2E-P0-4 order detail shows discounted buyer_total_amount after coupon checkout", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "buyer", "Buyer project only");
    test.skip(!hasStripeReconcileEnv(), "Missing Stripe reconcile env");
    test.skip(!hasBuyerAuthFixtures() || !hasCoreMerchantFixtures(), "Missing buyer/merchant fixtures");

    const fixtures = getMerchantProductDetailFixtures();
    const buyerId = await getProfileIdByEmail(fixtures.buyerEmail!);
    expect(buyerId).toBeTruthy();

    const templateId = await findActiveFreeShippingTemplateId();
    test.skip(!templateId, "No active free_shipping template");

    const rewardId = await grantUserRewardForE2e({
      userId: buyerId!,
      templateId: templateId!,
    });

    const merchantListing = await findActiveMerchantListingForE2e({
      excludeSellerId: buyerId!,
    });
    await reactivateListingForE2e(merchantListing.listingId);

    const orderId = await buyMerchantListingAndReachCheckout(
      page,
      merchantListing.sellerId,
      merchantListing.listingId,
    );

    await ensureCourierShippingSelected(page);
    await completeMerchantDirectCheckout(page, { couponRewardId: rewardId });

    const snapshot = await getMerchantOrderCouponSnapshot(orderId);
    expect(snapshot).toBeTruthy();
    const buyerTotal = Number(snapshot!.buyer_total_amount);
    expect(buyerTotal).toBeGreaterThan(0);
    expect(buyerTotal).toBeLessThan(Number(snapshot!.total_amount));

    await page.goto(`/profile/user/orderDetail/${orderId}`, {
      waitUntil: "domcontentloaded",
    });

    const paymentAmount = page.getByTestId("order-payment-amount");
    await expect(paymentAmount).toBeVisible({ timeout: 30_000 });

    const formatted = `HK$ ${buyerTotal.toLocaleString("zh-TW")}`;
    await expect(paymentAmount).toHaveText(formatted);
  });
});
