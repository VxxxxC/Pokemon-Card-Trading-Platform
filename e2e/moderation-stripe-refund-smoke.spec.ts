import { test, expect, type Page } from "@playwright/test";
import {
  assertSellerListingAlignment,
  hasStripeReconcileEnv,
  resolveReconcileMerchantListing,
  waitForMerchantOrderPaymentHeld,
} from "./helpers/stripe-reconcile";
import {
  buyMerchantListingAndReachCheckout,
  completeMerchantDirectCheckout,
} from "./helpers/platform-rewards";
import { ensureCourierShippingSelected } from "./helpers/rewards-checkout-coupon";
import {
  advanceOrderToModerationRefundEligible,
  assertCaseBundleHasEligibleRefundOrder,
  assertModerationRefundTerminal,
  assertOrderRefundEligible,
  assertStripeRefundForOrder,
  cleanupModerationStripeSmokeCase,
  getMerchantOrderNumber,
  getModerationStripeSmokeBuyerCreds,
  hasModerationStripeSmokeEnv,
  seedModerationCaseForStripeSmoke,
} from "./helpers/moderation-stripe-smoke";
import { fillAdminDisputeRefundFields } from "./helpers/moderation-auth-refund-partner";
import { getProfileIdByEmail } from "./fixtures/supabase-admin";
import { hasSellerAuthFixtures } from "./fixtures/chat-test-data";
import {
  getMerchantProductDetailFixtures,
  hasBuyerAuthFixtures,
  hasCoreMerchantFixtures,
} from "./fixtures/test-data";

test.describe.configure({ mode: "serial" });
test.use({ viewport: { width: 1280, height: 900 } });
test.setTimeout(300_000);

function readEnv(key: string): string | undefined {
  return process.env[key]?.trim() || undefined;
}

async function loginAsAdmin(page: Page): Promise<void> {
  const email = readEnv("E2E_ADMIN_EMAIL");
  const password = readEnv("E2E_ADMIN_PASSWORD");
  if (!email || !password) {
    throw new Error("Missing E2E_ADMIN_EMAIL or E2E_ADMIN_PASSWORD");
  }

  await page.goto("/auth");
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(password);
  await page.locator('form button[type="submit"]').click();
  await page.waitForURL((url) => !url.pathname.startsWith("/auth"), {
    timeout: 20_000,
  });
}

async function resolveAdminDisputeWithRefund(
  page: Page,
  params: { caseId: string; orderId: string; orderNumber: string },
): Promise<void> {
  await loginAsAdmin(page);
  await page.goto(`/admin/disputes/${params.caseId}`, {
    waitUntil: "domcontentloaded",
  });
  await expect(
    page.getByRole("heading", { name: "仲裁判定動作" }),
  ).toBeVisible({ timeout: 20_000 });

  await expect(
    page.getByRole("heading", { name: "關聯訂單" }),
  ).toBeVisible({ timeout: 20_000 });

  await page
    .getByRole("combobox")
    .filter({ hasText: /請選擇一項仲裁判定動作/ })
    .click();
  await page
    .getByRole("option", { name: "裁定成立（僅警告／可選退款）" })
    .click();

  await page
    .getByRole("combobox")
    .filter({ hasText: /請選擇違規身分/ })
    .click();
  await page.getByRole("option", { name: "Merchant" }).click();

  await fillAdminDisputeRefundFields(page, {
    orderNumber: params.orderNumber,
  });
  await page.getByRole("button", { name: "執行最終仲裁裁決" }).click();

  await expect(page).toHaveURL(/\/admin\/disputes\?status=completed/, {
    timeout: 60_000,
  });
}

test.describe("I-H14 moderation Stripe refund smoke", () => {
  const runId = String(Date.now());
  let sellerId: string | null = null;

  test.beforeAll(async () => {
    test.skip(!hasModerationStripeSmokeEnv(), "Missing moderation Stripe smoke env");
    test.skip(!hasStripeReconcileEnv(), "Missing STRIPE_SECRET_KEY or Supabase admin env");
    test.skip(!hasBuyerAuthFixtures() || !hasCoreMerchantFixtures(), "Missing buyer/merchant fixtures");
    test.skip(!hasSellerAuthFixtures(), "Missing E2E_SELLER_EMAIL or E2E_SELLER_PASSWORD");
    await assertSellerListingAlignment();
  });

  test.afterAll(async () => {
    if (sellerId) {
      await cleanupModerationStripeSmokeCase(sellerId).catch(() => undefined);
    }
  });

  test("I-H14 merchant_direct checkout → admin moderation refund saga", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "buyer", "Buyer project only");
    test.skip(!hasModerationStripeSmokeEnv(), "Missing moderation Stripe smoke env");

    const fixtures = getMerchantProductDetailFixtures();
    const buyerId = await getProfileIdByEmail(fixtures.buyerEmail!);
    expect(buyerId).toBeTruthy();

    const merchantListing = await resolveReconcileMerchantListing({
      excludeSellerId: buyerId!,
    });
    sellerId = merchantListing.sellerId;

    const orderId = await buyMerchantListingAndReachCheckout(
      page,
      merchantListing.sellerId,
      merchantListing.listingId,
    );

    await ensureCourierShippingSelected(page);
    await completeMerchantDirectCheckout(page);

    await waitForMerchantOrderPaymentHeld(orderId);

    const { buyerEmail, buyerPassword } = getModerationStripeSmokeBuyerCreds();
    await advanceOrderToModerationRefundEligible({
      orderId,
      sellerId: sellerId!,
      buyerEmail,
      buyerPassword,
    });
    await assertOrderRefundEligible(orderId);

    const seed = await seedModerationCaseForStripeSmoke({
      orderId,
      merchantId: sellerId!,
      buyerId: buyerId!,
      runId,
    });
    await assertCaseBundleHasEligibleRefundOrder(seed.caseId, orderId);
    const orderNumber = await getMerchantOrderNumber(orderId);

    await resolveAdminDisputeWithRefund(page, {
      caseId: seed.caseId,
      orderId,
      orderNumber,
    });

    await assertModerationRefundTerminal(orderId);
    await assertStripeRefundForOrder(orderId);
  });
});
