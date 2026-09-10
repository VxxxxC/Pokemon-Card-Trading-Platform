import { test, expect, type Page } from "@playwright/test";
import {
  assertListingIsActiveMerchant,
  buyMerchantListingAndReachCheckout,
  buyMerchantListingWithAuthAndReachCheckout,
  completeMerchantAuthCheckout,
  completeMerchantDirectCheckout,
  findActiveFreeShippingTemplateId,
  findActiveMerchantListingForE2e,
  getMerchantOrderCouponSnapshot,
  getRewardTemplateIdByTitle,
  grantUserRewardForE2e,
  publishDiscountCouponTemplate,
  publishRewardActivityViaAdmin,
  reactivateListingForE2e,
  setListingAuthenticationForE2e,
} from "./helpers/platform-rewards";
import { loginAsAdmin } from "./helpers/admin-auth";
import { getProfileIdByEmail } from "./fixtures/supabase-admin";
import {
  getMerchantProductDetailFixtures,
  hasBuyerAuthFixtures,
  hasCoreMerchantFixtures,
} from "./fixtures/test-data";
import {
  ensureCourierShippingSelected,
  selectCheckoutCoupon,
  waitForCheckoutCouponClearedAfterAuthToggle,
  waitForCheckoutCouponOptionEnabled,
  waitForCheckoutCouponPicker,
} from "./helpers/rewards-checkout-coupon";
import {
  assertPaymentIntentMatchesBuyerTotal,
  hasStripeReconcileEnv,
} from "./helpers/stripe-reconcile";

function readEnv(key: string): string | undefined {
  return process.env[key]?.trim() || undefined;
}

function hasAdminAuthFixtures(): boolean {
  return Boolean(readEnv("E2E_ADMIN_EMAIL") && readEnv("E2E_ADMIN_PASSWORD"));
}

test.describe.configure({ mode: "serial" });
test.use({ viewport: { width: 1280, height: 900 } });
test.setTimeout(300_000);

test.describe("Platform rewards Phase 2 E2E", () => {
  const templateTitle = `E2E Phase2 Free Ship ${Date.now()}`;
  const highMinSpendTemplateTitle = `E2E Phase2 High Min ${Date.now()}`;
  const lowMinSpendTemplateTitle = `E2E Phase2 Low Min ${Date.now()}`;
  let templateId: string | null = null;
  let highMinSpendTemplateId: string | null = null;
  let lowMinSpendTemplateId: string | null = null;
  let couponRewardId: string | null = null;
  let orderId: string | null = null;

  test.beforeAll(async ({ browser }, testInfo) => {
    if (testInfo.project.name !== "buyer") {
      return;
    }
    test.setTimeout(180_000);
    test.skip(
      !hasAdminAuthFixtures() ||
        !hasBuyerAuthFixtures() ||
        !hasCoreMerchantFixtures(),
      "Missing E2E admin/buyer/merchant listing env",
    );
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      test.skip(true, "Missing SUPABASE_SERVICE_ROLE_KEY for DB assertions");
    }
    templateId = await findActiveFreeShippingTemplateId();

    const fixtures = getMerchantProductDetailFixtures();
    const buyerId = await getProfileIdByEmail(fixtures.buyerEmail!);
    const merchantListing = await findActiveMerchantListingForE2e({
      excludeSellerId: buyerId ?? undefined,
    });
    const highMinSpend = Math.max(
      500,
      Math.ceil(merchantListing.price) + 100,
    );

    const context = await browser.newContext();
    const page = await context.newPage();
    await loginAsAdmin(page);

    if (!templateId) {
      await publishRewardActivityViaAdmin(page, {
        title: templateTitle,
        type: "free_shipping",
        maxSubsidy: 30,
      });
      templateId = await getRewardTemplateIdByTitle(templateTitle);
    }

    await publishDiscountCouponTemplate(page, {
      title: highMinSpendTemplateTitle,
      amount: 10,
      minSpend: highMinSpend,
    });
    highMinSpendTemplateId = await getRewardTemplateIdByTitle(
      highMinSpendTemplateTitle,
    );

    await publishDiscountCouponTemplate(page, {
      title: lowMinSpendTemplateTitle,
      amount: 10,
      minSpend: 0,
    });
    lowMinSpendTemplateId = await getRewardTemplateIdByTitle(
      lowMinSpendTemplateTitle,
    );

    await context.close();

    if (!highMinSpendTemplateId || !lowMinSpendTemplateId || !templateId) {
      throw new Error(
        "Failed to bootstrap Phase 2 E2E reward templates (free-shipping or discount)",
      );
    }
  });

  test("A1–A3 admin publishes free-shipping template via wizard", async ({
    browser,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "guest", "Admin-only setup");
    test.skip(!hasAdminAuthFixtures(), "Missing admin credentials");

    templateId = await findActiveFreeShippingTemplateId();
    if (templateId) {
      return;
    }

    const context = await browser.newContext();
    const page = await context.newPage();
    await loginAsAdmin(page);
    await publishRewardActivityViaAdmin(page, {
      title: templateTitle,
      type: "free_shipping",
      maxSubsidy: 30,
    });
    templateId = await getRewardTemplateIdByTitle(templateTitle);
    expect(templateId).toBeTruthy();
    await context.close();
  });

  test("A4 admin publishes discount_coupon template for min-spend tests", async (
    {},
    testInfo,
  ) => {
    test.skip(testInfo.project.name !== "buyer", "Bootstrap verified on buyer project");
    expect(highMinSpendTemplateId).toBeTruthy();
    expect(lowMinSpendTemplateId).toBeTruthy();
  });

  test("B1 free-shipping checkout applies platform subsidy", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "buyer", "Buyer auth required");
    test.skip(!templateId, "Template not created in prior step");

    const fixtures = getMerchantProductDetailFixtures();
    const buyerEmail = fixtures.buyerEmail!;
    const buyerId = await getProfileIdByEmail(buyerEmail);
    expect(buyerId).toBeTruthy();

    const merchantListing = await findActiveMerchantListingForE2e({
      excludeSellerId: buyerId!,
    });
    const listingId = merchantListing.listingId;
    const sellerId = merchantListing.sellerId;
    await reactivateListingForE2e(listingId);
    await assertListingIsActiveMerchant(listingId);

    couponRewardId = await grantUserRewardForE2e({
      userId: buyerId!,
      templateId: templateId!,
    });

    orderId = await buyMerchantListingAndReachCheckout(
      page,
      sellerId,
      listingId,
    );

    await ensureCourierShippingSelected(page);
    await waitForCheckoutCouponPicker(page, { rewardId: couponRewardId! });
    await selectCheckoutCoupon(page, couponRewardId!);
    await expect(page.getByText(/- HK\$/)).toBeVisible();

    await completeMerchantDirectCheckout(page, {
      couponRewardId: couponRewardId!,
    });

    const snapshot = await getMerchantOrderCouponSnapshot(orderId!);
    expect(snapshot).toBeTruthy();
    expect(Number(snapshot!.platform_subsidy_amount)).toBeGreaterThan(0);
    expect(Number(snapshot!.buyer_total_amount)).toBeLessThan(
      Number(snapshot!.total_amount),
    );
    expect(snapshot!.coupon_user_reward_id).toBe(couponRewardId);
  });

  test("B2 min spend eligibility at checkout", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "buyer", "Buyer auth required");
    test.skip(
      !highMinSpendTemplateId || !lowMinSpendTemplateId,
      "Discount templates not created",
    );

    const fixtures = getMerchantProductDetailFixtures();
    const buyerId = await getProfileIdByEmail(fixtures.buyerEmail!);
    const merchantListing = await findActiveMerchantListingForE2e({
      excludeSellerId: buyerId!,
    });
    await reactivateListingForE2e(merchantListing.listingId);

    const ineligibleRewardId = await grantUserRewardForE2e({
      userId: buyerId!,
      templateId: highMinSpendTemplateId!,
    });
    const eligibleRewardId = await grantUserRewardForE2e({
      userId: buyerId!,
      templateId: lowMinSpendTemplateId!,
    });

    await buyMerchantListingAndReachCheckout(
      page,
      merchantListing.sellerId,
      merchantListing.listingId,
    );

    await ensureCourierShippingSelected(page);
    await waitForCheckoutCouponPicker(page);

    const ineligibleOption = page.locator(
      `#checkout-coupon option[value="${ineligibleRewardId}"]`,
    );
    await expect(ineligibleOption).toBeDisabled();
    const ineligibleLabel = (await ineligibleOption.textContent()) ?? "";
    expect(ineligibleLabel).toMatch(/未達優惠券最低消費門檻/);

    await selectCheckoutCoupon(page, eligibleRewardId);
  });

  test("B3.4 switching coupon A to B updates selection", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "buyer", "Buyer auth required");
    test.skip(!templateId || !lowMinSpendTemplateId, "Templates not created");

    const fixtures = getMerchantProductDetailFixtures();
    const buyerId = await getProfileIdByEmail(fixtures.buyerEmail!);
    const merchantListing = await findActiveMerchantListingForE2e({
      excludeSellerId: buyerId!,
    });
    await reactivateListingForE2e(merchantListing.listingId);

    const freeShippingRewardId = await grantUserRewardForE2e({
      userId: buyerId!,
      templateId: templateId!,
    });
    const discountRewardId = await grantUserRewardForE2e({
      userId: buyerId!,
      templateId: lowMinSpendTemplateId!,
    });

    await buyMerchantListingAndReachCheckout(
      page,
      merchantListing.sellerId,
      merchantListing.listingId,
    );

    await waitForCheckoutCouponPicker(page);
    await page.locator("#checkout-coupon").selectOption(freeShippingRewardId);
    await page.waitForTimeout(1000);
    await expect(page.locator("#checkout-coupon")).toHaveValue(
      freeShippingRewardId,
    );

    await page.locator("#checkout-coupon").selectOption(discountRewardId);
    await page.waitForTimeout(1000);
    await expect(page.locator("#checkout-coupon")).toHaveValue(discountRewardId);
  });

  test("B3.5 clearing coupon pays without subsidy", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "buyer", "Buyer auth required");
    test.skip(!templateId, "Template not created");

    const fixtures = getMerchantProductDetailFixtures();
    const buyerId = await getProfileIdByEmail(fixtures.buyerEmail!);
    const merchantListing = await findActiveMerchantListingForE2e({
      excludeSellerId: buyerId!,
    });
    await reactivateListingForE2e(merchantListing.listingId);

    const rewardId = await grantUserRewardForE2e({
      userId: buyerId!,
      templateId: templateId!,
    });

    const clearCouponOrderId = await buyMerchantListingAndReachCheckout(
      page,
      merchantListing.sellerId,
      merchantListing.listingId,
    );

    await waitForCheckoutCouponPicker(page, { rewardId });
    await page.locator("#checkout-coupon").selectOption(rewardId);
    await page.waitForTimeout(1000);
    await page.locator("#checkout-coupon").selectOption("");
    await page.waitForTimeout(1000);
    await expect(page.locator("#checkout-coupon")).toHaveValue("");

    await completeMerchantDirectCheckout(page);

    const snapshot = await getMerchantOrderCouponSnapshot(clearCouponOrderId);
    expect(snapshot).toBeTruthy();
    expect(Number(snapshot!.platform_subsidy_amount ?? 0)).toBe(0);
    expect(snapshot!.coupon_user_reward_id).toBeNull();
  });

  test("B3.1 auth toggle keeps coupon picker visible and clears selection", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "buyer", "Buyer auth required");
    test.skip(!templateId, "Template not created");

    const fixtures = getMerchantProductDetailFixtures();
    const buyerId = await getProfileIdByEmail(fixtures.buyerEmail!);
    const merchantListing = await findActiveMerchantListingForE2e({
      excludeSellerId: buyerId!,
    });
    const rewardId = await grantUserRewardForE2e({
      userId: buyerId!,
      templateId: templateId!,
    });

    await reactivateListingForE2e(merchantListing.listingId);
    await setListingAuthenticationForE2e(merchantListing.listingId, true);

    await buyMerchantListingAndReachCheckout(
      page,
      merchantListing.sellerId,
      merchantListing.listingId,
    );

    await waitForCheckoutCouponPicker(page, { rewardId });
    await page.locator("#checkout-coupon").selectOption(rewardId);
    await page.waitForTimeout(1000);

    const authSection = page
      .getByRole("heading", { name: "平台鑑定服務" })
      .locator("xpath=ancestor::section[1]");
    const authSwitch = authSection.getByRole("switch");
    await expect(authSwitch).toBeEnabled({ timeout: 10_000 });
    if ((await authSwitch.getAttribute("aria-checked")) !== "true") {
      await authSwitch.focus();
      await page.keyboard.press("Space");
    }
    await expect(authSwitch).toHaveAttribute("aria-checked", "true", {
      timeout: 10_000,
    });

    await waitForCheckoutCouponClearedAfterAuthToggle(page);
  });

  test("B2b.1 merchant_auth checkout applies discount coupon subsidy", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "buyer", "Buyer auth required");

    test.skip(!lowMinSpendTemplateId, "Discount templates not created");

    const fixtures = getMerchantProductDetailFixtures();
    const buyerId = await getProfileIdByEmail(fixtures.buyerEmail!);
    const merchantListing = await findActiveMerchantListingForE2e({
      excludeSellerId: buyerId!,
    });
    await reactivateListingForE2e(merchantListing.listingId);
    await setListingAuthenticationForE2e(merchantListing.listingId, true);

    const rewardId = await grantUserRewardForE2e({
      userId: buyerId!,
      templateId: lowMinSpendTemplateId!,
    });

    const authOrderId = await buyMerchantListingWithAuthAndReachCheckout(
      page,
      merchantListing.sellerId,
      merchantListing.listingId,
    );

    await waitForCheckoutCouponPicker(page, { rewardId });
    await selectCheckoutCoupon(page, rewardId);

    await completeMerchantAuthCheckout(page, { couponRewardId: rewardId });

    if (hasStripeReconcileEnv()) {
      await assertPaymentIntentMatchesBuyerTotal(authOrderId);
    }

    const snapshot = await getMerchantOrderCouponSnapshot(authOrderId);
    expect(snapshot).toBeTruthy();
    expect(snapshot!.escrow_capture_model).toBe("single");
    expect(Number(snapshot!.shipping_fee)).toBe(0);
    expect(Number(snapshot!.inbound_shipping_fee)).toBeGreaterThan(0);
    expect(Number(snapshot!.outbound_shipping_fee)).toBeGreaterThan(0);
    expect(Number(snapshot!.total_amount)).toBe(
      Number(snapshot!.item_subtotal) +
        Number(snapshot!.auth_fee) +
        Number(snapshot!.inbound_shipping_fee) +
        Number(snapshot!.outbound_shipping_fee),
    );
    expect(Number(snapshot!.platform_subsidy_amount)).toBeGreaterThan(0);
    expect(Number(snapshot!.buyer_total_amount)).toBe(
      Number(snapshot!.total_amount) -
        Number(snapshot!.platform_subsidy_amount),
    );
    expect(snapshot!.coupon_user_reward_id).toBe(rewardId);
  });

  test("B2b.2 merchant_auth checkout applies free-shipping subsidy", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "buyer", "Buyer auth required");
    test.skip(!templateId, "Template not created");

    const fixtures = getMerchantProductDetailFixtures();
    const buyerId = await getProfileIdByEmail(fixtures.buyerEmail!);
    const merchantListing = await findActiveMerchantListingForE2e({
      excludeSellerId: buyerId!,
    });
    await reactivateListingForE2e(merchantListing.listingId);
    await setListingAuthenticationForE2e(merchantListing.listingId, true);

    const rewardId = await grantUserRewardForE2e({
      userId: buyerId!,
      templateId: templateId!,
    });

    const authOrderId = await buyMerchantListingWithAuthAndReachCheckout(
      page,
      merchantListing.sellerId,
      merchantListing.listingId,
    );

    await waitForCheckoutCouponPicker(page, { rewardId });
    await selectCheckoutCoupon(page, rewardId);

    await completeMerchantAuthCheckout(page, { couponRewardId: rewardId });

    if (hasStripeReconcileEnv()) {
      await assertPaymentIntentMatchesBuyerTotal(authOrderId);
    }

    const snapshot = await getMerchantOrderCouponSnapshot(authOrderId);
    expect(snapshot).toBeTruthy();
    expect(snapshot!.escrow_capture_model).toBe("single");
    expect(Number(snapshot!.shipping_fee)).toBe(0);
    expect(Number(snapshot!.inbound_shipping_fee)).toBeGreaterThan(0);
    expect(Number(snapshot!.outbound_shipping_fee)).toBeGreaterThan(0);
    expect(Number(snapshot!.total_amount)).toBe(
      Number(snapshot!.item_subtotal) +
        Number(snapshot!.auth_fee) +
        Number(snapshot!.inbound_shipping_fee) +
        Number(snapshot!.outbound_shipping_fee),
    );
    expect(Number(snapshot!.platform_subsidy_amount)).toBeGreaterThan(0);
    expect(Number(snapshot!.platform_subsidy_amount)).toBeLessThanOrEqual(
      Number(snapshot!.outbound_shipping_fee),
    );
    expect(Number(snapshot!.buyer_total_amount)).toBe(
      Number(snapshot!.total_amount) -
        Number(snapshot!.platform_subsidy_amount),
    );
    expect(snapshot!.coupon_type).toBe("free_shipping");
    expect(snapshot!.coupon_user_reward_id).toBe(rewardId);
  });

  test("B3.3 meetup makes free-shipping coupon ineligible", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "buyer", "Buyer auth required");
    test.skip(!templateId, "Template not created");

    const fixtures = getMerchantProductDetailFixtures();
    const buyerId = await getProfileIdByEmail(fixtures.buyerEmail!);
    const merchantListing = await findActiveMerchantListingForE2e({
      excludeSellerId: buyerId!,
    });
    await reactivateListingForE2e(merchantListing.listingId);
    await setListingAuthenticationForE2e(merchantListing.listingId, false);
    const rewardId = await grantUserRewardForE2e({
      userId: buyerId!,
      templateId: templateId!,
    });

    await buyMerchantListingAndReachCheckout(
      page,
      merchantListing.sellerId,
      merchantListing.listingId,
    );

    await waitForCheckoutCouponPicker(page, { rewardId });
    await ensureCourierShippingSelected(page);
    await waitForCheckoutCouponOptionEnabled(page, rewardId);
    await page.getByRole("button", { name: "面交／自取" }).click();
    await page.waitForTimeout(1_500);

    const couponPicker = page.locator("#checkout-coupon");
    const couponVisible = await couponPicker.isVisible().catch(() => false);
    if (!couponVisible) {
      return;
    }

    const option = page.locator(`#checkout-coupon option[value="${rewardId}"]`);
    await expect(option).toBeDisabled();
    const label = (await option.textContent()) ?? "";
    expect(label).toMatch(/面交|運費|順豐|配送|ineligible|不|無法/i);
  });
});
