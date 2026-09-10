import { test, expect } from "@playwright/test";
import {
  advanceOrderToPayoutReady,
  assertPaymentIntentMatchesBuyerTotal,
  assertSellerListingAlignment,
  assertTransferPayoutRule,
  clearUnsettledGradingRecoveryForE2e,
  hasStripeReconcileEnv,
  resolveReconcileMerchantListing,
  runMerchantConnectPayout,
  waitForMerchantOrderPaymentHeld,
} from "./helpers/stripe-reconcile";
import { getChatRealtimeFixtures } from "./fixtures/chat-test-data";
import {
  buyMerchantListingAndReachCheckout,
  completeMerchantDirectCheckout,
  findActiveFreeShippingTemplateId,
  getUserRewardRow,
  grantUserRewardForE2e,
} from "./helpers/platform-rewards";
import { getProfileIdByEmail } from "./fixtures/supabase-admin";
import { hasSellerAuthFixtures } from "./fixtures/chat-test-data";
import {
  getMerchantProductDetailFixtures,
  hasBuyerAuthFixtures,
  hasCoreMerchantFixtures,
} from "./fixtures/test-data";
import {
  ensureCourierShippingSelected,
  waitForCheckoutCouponPicker,
} from "./helpers/rewards-checkout-coupon";

test.describe.configure({ mode: "serial" });
test.use({ viewport: { width: 1280, height: 900 } });
test.setTimeout(300_000);

test.describe("Platform rewards Stripe reconcile E2E", () => {
  let subsidizedOrderId: string | null = null;
  let subsidizedListingId: string | null = null;
  let subsidizedSellerId: string | null = null;
  let subsidizedBuyerTotal = 0;
  let subsidizedMerchantPayout = 0;
  let plainOrderId: string | null = null;
  let plainSellerId: string | null = null;
  let plainBuyerTotal = 0;
  let plainMerchantPayout = 0;

  test.beforeAll(async () => {
    test.skip(!hasStripeReconcileEnv(), "Missing STRIPE_SECRET_KEY or Supabase admin env");
    test.skip(!hasBuyerAuthFixtures() || !hasCoreMerchantFixtures(), "Missing buyer/merchant fixtures");
    test.skip(!hasSellerAuthFixtures(), "Missing E2E_SELLER_EMAIL or E2E_SELLER_PASSWORD");
    await assertSellerListingAlignment();
    const sellerId = getChatRealtimeFixtures().sellerId?.trim();
    if (sellerId) {
      await clearUnsettledGradingRecoveryForE2e(sellerId);
    }
  });

  test("R1 PI amount matches buyer_total (free-shipping coupon)", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "buyer", "Buyer project only");
    test.skip(!hasStripeReconcileEnv(), "Missing Stripe reconcile env");

    const fixtures = getMerchantProductDetailFixtures();
    const buyerId = await getProfileIdByEmail(fixtures.buyerEmail!);
    expect(buyerId).toBeTruthy();

    const templateId = await findActiveFreeShippingTemplateId();
    test.skip(!templateId, "No active free_shipping template");

    const merchantListing = await resolveReconcileMerchantListing({
      excludeSellerId: buyerId!,
    });

    const couponRewardId = await grantUserRewardForE2e({
      userId: buyerId!,
      templateId: templateId!,
    });

    subsidizedListingId = merchantListing.listingId;
    subsidizedOrderId = await buyMerchantListingAndReachCheckout(
      page,
      merchantListing.sellerId,
      merchantListing.listingId,
    );
    subsidizedSellerId = merchantListing.sellerId;

    await ensureCourierShippingSelected(page);
    await waitForCheckoutCouponPicker(page, { rewardId: couponRewardId });
    await page.locator("#checkout-coupon").selectOption(couponRewardId);
    await page.waitForTimeout(1500);

    await completeMerchantDirectCheckout(page, { couponRewardId });

    await assertPaymentIntentMatchesBuyerTotal(subsidizedOrderId);

    const held = await waitForMerchantOrderPaymentHeld(subsidizedOrderId);
    subsidizedBuyerTotal = held.buyer_total_amount!;
    expect(Number(held.platform_subsidy_amount ?? 0)).toBeGreaterThan(0);

    await expect
      .poll(async () => (await getUserRewardRow(couponRewardId))?.is_used, {
        timeout: 45_000,
      })
      .toBe(true);
  });

  test("R2 subsidized payout omits source_transaction (platform top-up)", async (
    {},
    testInfo,
  ) => {
    test.skip(testInfo.project.name !== "buyer", "Buyer project only");
    test.skip(!subsidizedOrderId || !subsidizedSellerId, "R1 order missing");

    const fixtures = getMerchantProductDetailFixtures();
    const held = await advanceOrderToPayoutReady({
      orderId: subsidizedOrderId!,
      sellerId: subsidizedSellerId!,
      buyerEmail: fixtures.buyerEmail!,
      buyerPassword: fixtures.buyerPassword!,
    });

    subsidizedMerchantPayout = held.merchant_payout_amount!;
    expect(Number(held.platform_subsidy_amount ?? 0)).toBeGreaterThan(0);

    const transferId = await runMerchantConnectPayout(subsidizedOrderId!);
    await assertTransferPayoutRule({
      transferId,
      merchantPayoutAmount: subsidizedMerchantPayout,
      buyerTotalAmount: subsidizedBuyerTotal,
    });
  });

  test("R3 plain checkout payout binds source_transaction", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "buyer", "Buyer project only");
    test.skip(!hasStripeReconcileEnv(), "Missing Stripe reconcile env");

    const fixtures = getMerchantProductDetailFixtures();
    const buyerId = await getProfileIdByEmail(fixtures.buyerEmail!);
    const merchantListing = await resolveReconcileMerchantListing({
      excludeSellerId: buyerId ?? undefined,
      preferListingId: subsidizedListingId ?? undefined,
    });

    plainOrderId = await buyMerchantListingAndReachCheckout(
      page,
      merchantListing.sellerId,
      merchantListing.listingId,
    );
    plainSellerId = merchantListing.sellerId;

    await completeMerchantDirectCheckout(page);

    await assertPaymentIntentMatchesBuyerTotal(plainOrderId);
    const paid = await waitForMerchantOrderPaymentHeld(plainOrderId);
    plainBuyerTotal = paid.buyer_total_amount!;
    expect(Number(paid.platform_subsidy_amount ?? 0)).toBe(0);

    const held = await advanceOrderToPayoutReady({
      orderId: plainOrderId,
      sellerId: plainSellerId!,
      buyerEmail: fixtures.buyerEmail!,
      buyerPassword: fixtures.buyerPassword!,
    });

    plainMerchantPayout = held.merchant_payout_amount!;
    expect(plainMerchantPayout).toBeLessThanOrEqual(plainBuyerTotal);

    const transferId = await runMerchantConnectPayout(plainOrderId);
    await assertTransferPayoutRule({
      transferId,
      merchantPayoutAmount: plainMerchantPayout,
      buyerTotalAmount: plainBuyerTotal,
    });
  });
});
