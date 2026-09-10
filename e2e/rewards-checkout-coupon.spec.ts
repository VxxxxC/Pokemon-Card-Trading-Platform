import { test, expect, type Page } from "@playwright/test";
import { getProfileIdByEmail } from "./fixtures/supabase-admin";
import {
  getMerchantProductDetailFixtures,
  hasBuyerAuthFixtures,
  hasCoreMerchantFixtures,
} from "./fixtures/test-data";
import {
  buyMerchantListingAndReachCheckout,
  dismissBlockingOverlays,
  findActiveFreeShippingTemplateId,
  findActiveMerchantListingForE2e,
  getRewardTemplateIdByTitle,
  grantUserRewardForE2e,
  publishDiscountCouponTemplate,
  publishRewardActivityViaAdmin,
  reactivateListingForE2e,
} from "./helpers/platform-rewards";
import {
  expireUserRewardForE2e,
  expectPlatformSubsidyVisible,
  selectCheckoutCoupon,
  clearCheckoutCoupon,
  ensureCourierShippingSelected,
  fillMerchantDirectFulfillmentForm,
  readCheckoutSummaryAmounts,
  findActiveFreeShippingTemplateFromAudits,
  waitForCheckoutCouponOptionEnabled,
  waitForCheckoutCouponPicker,
  waitForMerchantDirectCheckoutReady,
} from "./helpers/rewards-checkout-coupon";
import { loginAsAdmin } from "./helpers/admin-auth";

function readEnv(key: string): string | undefined {
  return process.env[key]?.trim() || undefined;
}

function hasAdminAuthFixtures(): boolean {
  return Boolean(readEnv("E2E_ADMIN_EMAIL") && readEnv("E2E_ADMIN_PASSWORD"));
}

function hasRewardsCheckoutE2eEnv(): boolean {
  return (
    hasAdminAuthFixtures() &&
    hasBuyerAuthFixtures() &&
    hasCoreMerchantFixtures() &&
    Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY)
  );
}

async function seedFreeShippingTemplateIfMissing(
  browser: import("@playwright/test").Browser,
  title: string,
): Promise<void> {
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await loginAsAdmin(page);
    await dismissBlockingOverlays(page);
    await publishRewardActivityViaAdmin(page, {
      type: "free_shipping",
      title,
      maxSubsidy: 30,
    });
  } finally {
    await context.close();
  }
}

async function reachMerchantDirectCheckout(page: Page): Promise<void> {
  const fixtures = getMerchantProductDetailFixtures();
  const buyerId = await getProfileIdByEmail(fixtures.buyerEmail!);
  if (!buyerId) {
    throw new Error("Missing buyer profile for rewards checkout E2E");
  }

  const merchantListing = await findActiveMerchantListingForE2e({
    excludeSellerId: buyerId,
  });
  await reactivateListingForE2e(merchantListing.listingId);
  await buyMerchantListingAndReachCheckout(
    page,
    merchantListing.sellerId,
    merchantListing.listingId,
  );

  await waitForCheckoutCouponPicker(page);
  await waitForMerchantDirectCheckoutReady(page);
}

test.describe.configure({ mode: "serial" });
test.use({ viewport: { width: 1280, height: 900 } });
test.setTimeout(300_000);

test.describe("Rewards checkout coupon E2E", () => {
  const runId = String(Date.now());
  const highMinSpendTemplateTitle = `E2E Checkout High Min ${runId}`;
  const lowMinSpendTemplateTitle = `E2E Checkout Low Min ${runId}`;
  const freeShippingTemplateTitle = `E2E Coupon Free Ship ${runId}`;

  let highMinSpendTemplateId: string | null = null;
  let lowMinSpendTemplateId: string | null = null;
  let freeShippingTemplateId: string | null = null;

  test.beforeAll(async ({ browser }) => {
    test.setTimeout(180_000);
    test.skip(!hasRewardsCheckoutE2eEnv(), "Missing rewards checkout E2E env");

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
    try {
      await loginAsAdmin(page);
      await dismissBlockingOverlays(page);
      await publishDiscountCouponTemplate(page, {
        title: highMinSpendTemplateTitle,
        amount: 10,
        minSpend: highMinSpend,
      });
      await publishDiscountCouponTemplate(page, {
        title: lowMinSpendTemplateTitle,
        amount: 10,
        minSpend: 0,
      });
    } finally {
      await context.close();
    }

    highMinSpendTemplateId = await getRewardTemplateIdByTitle(
      highMinSpendTemplateTitle,
    );
    lowMinSpendTemplateId = await getRewardTemplateIdByTitle(
      lowMinSpendTemplateTitle,
    );

    if (!highMinSpendTemplateId || !lowMinSpendTemplateId) {
      throw new Error(
        "Failed to publish checkout coupon templates for rewards-checkout E2E",
      );
    }

    freeShippingTemplateId =
      (await findActiveFreeShippingTemplateFromAudits()) ??
      (await findActiveFreeShippingTemplateId());
    if (!freeShippingTemplateId) {
      await seedFreeShippingTemplateIfMissing(browser, freeShippingTemplateTitle);
      freeShippingTemplateId =
        (await getRewardTemplateIdByTitle(freeShippingTemplateTitle)) ??
        (await findActiveFreeShippingTemplateFromAudits()) ??
        (await findActiveFreeShippingTemplateId());
    }
  });

  test("E2E-C1 min spend coupon is disabled with threshold hint", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "buyer", "Buyer auth required");
    test.skip(
      !highMinSpendTemplateId || !lowMinSpendTemplateId,
      "Coupon templates not ready",
    );

    const fixtures = getMerchantProductDetailFixtures();
    const buyerId = await getProfileIdByEmail(fixtures.buyerEmail!);
    const ineligibleRewardId = await grantUserRewardForE2e({
      userId: buyerId!,
      templateId: highMinSpendTemplateId!,
    });
    const eligibleRewardId = await grantUserRewardForE2e({
      userId: buyerId!,
      templateId: lowMinSpendTemplateId!,
    });

    await reachMerchantDirectCheckout(page);

    const ineligibleOption = page.locator(
      `#checkout-coupon option[value="${ineligibleRewardId}"]`,
    );
    await expect(ineligibleOption).toBeDisabled();
    expect((await ineligibleOption.textContent()) ?? "").toMatch(
      /未達優惠券最低消費門檻/,
    );

    const eligibleOption = page.locator(
      `#checkout-coupon option[value="${eligibleRewardId}"]`,
    );
    await expect(eligibleOption).not.toBeDisabled();
  });

  test("E2E-C2 selecting coupon updates platform subsidy and total", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "buyer", "Buyer auth required");
    test.skip(!lowMinSpendTemplateId, "Low min-spend template not ready");

    const fixtures = getMerchantProductDetailFixtures();
    const buyerId = await getProfileIdByEmail(fixtures.buyerEmail!);
    const rewardId = await grantUserRewardForE2e({
      userId: buyerId!,
      templateId: lowMinSpendTemplateId!,
    });

    await reachMerchantDirectCheckout(page);

    const baseline = await readCheckoutSummaryAmounts(page);
    expect(baseline.platformSubsidy).toBe(0);

    await selectCheckoutCoupon(page, rewardId);

    const optionLabel =
      (await page
        .locator(`#checkout-coupon option[value="${rewardId}"]`)
        .textContent()) ?? "";
    const previewMatch = optionLabel.match(/-HK\$(\d+(?:\.\d+)?)/);
    const expectedSubsidy = previewMatch
      ? Number(previewMatch[1])
      : Math.min(10, baseline.itemSubtotal);

    const withCoupon = await readCheckoutSummaryAmounts(page);

    expect(withCoupon.platformSubsidy).toBe(expectedSubsidy);
    expect(withCoupon.totalAmount).toBe(
      baseline.itemSubtotal + baseline.shippingFee - expectedSubsidy,
    );

    await clearCheckoutCoupon(page);

    const cleared = await readCheckoutSummaryAmounts(page);
    expect(cleared.platformSubsidy).toBe(0);
    expect(cleared.totalAmount).toBe(baseline.totalAmount);
  });

  test("E2E-C3 meetup shipping clears or blocks free-shipping coupon", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "buyer", "Buyer auth required");
    test.skip(!freeShippingTemplateId, "Free-shipping template not ready");

    const fixtures = getMerchantProductDetailFixtures();
    const buyerId = await getProfileIdByEmail(fixtures.buyerEmail!);
    const rewardId = await grantUserRewardForE2e({
      userId: buyerId!,
      templateId: freeShippingTemplateId!,
    });

    await reachMerchantDirectCheckout(page);

    await ensureCourierShippingSelected(page);
    await waitForCheckoutCouponOptionEnabled(page, rewardId);
    await page.locator("#checkout-coupon").selectOption(rewardId);
    await page.waitForTimeout(1500);
    await expect(page.locator("#checkout-coupon")).toHaveValue(rewardId);
    await expectPlatformSubsidyVisible(page, true);

    await page.getByRole("button", { name: "面交／自取" }).click();
    await page.waitForTimeout(1500);

    const couponPicker = page.locator("#checkout-coupon");
    const couponVisible = await couponPicker.isVisible().catch(() => false);
    if (couponVisible) {
      await expect(couponPicker).toHaveValue("");
    }
    await expectPlatformSubsidyVisible(page, false);

    if (!couponVisible) {
      return;
    }

    const option = page.locator(`#checkout-coupon option[value="${rewardId}"]`);
    await expect(option).toBeDisabled();
    const label = (await option.textContent()) ?? "";
    expect(label).toMatch(/面交|運費|順豐|配送|ineligible|不|無法/i);
  });

  test("E2E-C4 expired coupon prepare shows toast and resets selection", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "buyer", "Buyer auth required");
    test.skip(!lowMinSpendTemplateId, "Low min-spend template not ready");

    const fixtures = getMerchantProductDetailFixtures();
    const buyerId = await getProfileIdByEmail(fixtures.buyerEmail!);
    const rewardId = await grantUserRewardForE2e({
      userId: buyerId!,
      templateId: lowMinSpendTemplateId!,
    });

    await reachMerchantDirectCheckout(page);

    const baseline = await readCheckoutSummaryAmounts(page);
    await page.locator("#checkout-coupon").selectOption(rewardId);
    await page.waitForTimeout(1500);
    await expectPlatformSubsidyVisible(page, true);

    await fillMerchantDirectFulfillmentForm(page);
    await expireUserRewardForE2e(rewardId);

    await page.getByRole("button", { name: /繼續付款/ }).click();

    const toast = page.locator("[data-sonner-toast]").filter({
      hasText: /無法建立託管付款|過期/,
    });
    await expect(toast.first()).toBeVisible({ timeout: 30_000 });

    await expect(page.locator("#checkout-coupon")).toHaveValue("");
    await expectPlatformSubsidyVisible(page, false);

    const resetSummary = await readCheckoutSummaryAmounts(page);
    expect(resetSummary.platformSubsidy).toBe(0);
    expect(resetSummary.totalAmount).toBe(baseline.totalAmount);

    await expect(page.getByRole("button", { name: /繼續付款/ })).toBeVisible();
  });
});
