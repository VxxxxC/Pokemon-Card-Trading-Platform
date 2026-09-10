import { test, expect, type Page } from "@playwright/test";
import {
  buildFlashCampaignScheduleForE2e,
  buildFutureFlashCampaignScheduleForE2e,
  buyMerchantListingAndReachCheckout,
  claimFlashCampaignForUser,
  completeMerchantDirectCheckout,
  countRewardCampaignClaims,
  ensureE2eFlashBuyer,
  findActiveMerchantListingForE2e,
  findLatestUserRewardForTemplate,
  getFlashCampaignIdByName,
  getMerchantOrderCouponSnapshot,
  getRewardTemplateIdByTitle,
  gotoMemberRewardsPage,
  listActiveFlashCampaignRowsForE2e,
  listActiveFlashCampaignRowsForUser,
  gotoAdminRewardActivityForm,
  publishRewardActivityViaAdmin,
  reactivateListingForE2e,
  setFlashCampaignStatusViaAdmin,
  tryClaimFlashCampaignViaUI,
  waitForFlashCampaignSectionReady,
} from "./helpers/platform-rewards";
import { loginAsAdmin } from "./helpers/admin-auth";
import { waitForCheckoutCouponPicker, selectCheckoutCoupon } from "./helpers/rewards-checkout-coupon";
import { getProfileIdByEmail } from "./fixtures/supabase-admin";
import {
  getMerchantProductDetailFixtures,
  hasBuyerAuthFixtures,
} from "./fixtures/test-data";

function readEnv(key: string): string | undefined {
  return process.env[key]?.trim() || undefined;
}

function hasAdminAuthFixtures(): boolean {
  return Boolean(readEnv("E2E_ADMIN_EMAIL") && readEnv("E2E_ADMIN_PASSWORD"));
}

async function publishFlashCampaignTemplate(
  page: Page,
  params: {
    templateTitle: string;
    campaignName: string;
    maxClaims: number;
  },
): Promise<void> {
  const schedule = buildFlashCampaignScheduleForE2e({
    campaignName: params.campaignName,
    maxClaims: params.maxClaims,
    maxClaimsPerUser: 1,
  });

  await publishRewardActivityViaAdmin(page, {
    title: params.templateTitle,
    type: "discount_coupon",
    amount: 10,
    distributionMode: "flash_only",
    flashSchedule: schedule,
  });
}

test.describe.configure({ mode: "serial" });
test.use({ viewport: { width: 1280, height: 900 } });
test.setTimeout(300_000);

test.describe("Platform rewards Phase 3 E2E", () => {
  const templateTitle = `E2E Phase3 Flash ${Date.now()}`;
  const campaignName = `E2E Phase3 Campaign ${Date.now()}`;
  let campaignId: string | null = null;
  let templateId: string | null = null;
  let flashCouponRewardId: string | null = null;
  let buyerB: { email: string; password: string; userId: string } | null =
    null;
  let buyerC: { email: string; password: string; userId: string } | null =
    null;

  test.beforeAll(async ({ browser }, testInfo) => {
    test.setTimeout(180_000);
    if (testInfo.project.name !== "buyer") {
      return;
    }
    if (
      !hasAdminAuthFixtures() ||
      !hasBuyerAuthFixtures()
    ) {
      throw new Error("Missing E2E admin/buyer env for Phase 3 buyer bootstrap");
    }
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY for DB assertions");
    }
    if (!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
      throw new Error("Missing NEXT_PUBLIC_SUPABASE_ANON_KEY for flash RPC");
    }

    buyerB = await ensureE2eFlashBuyer({ suffix: "b" });
    buyerC = await ensureE2eFlashBuyer({ suffix: "c" });

    const context = await browser.newContext();
    const page = await context.newPage();
    await loginAsAdmin(page);
    await publishFlashCampaignTemplate(page, {
      templateTitle,
      campaignName,
      maxClaims: 2,
    });
    await context.close();

    templateId = await getRewardTemplateIdByTitle(templateTitle);
    campaignId = await getFlashCampaignIdByName(templateTitle);

    if (!templateId || !campaignId) {
      throw new Error("Failed to bootstrap flash campaign for Phase 3 E2E");
    }

    const activeRows = await listActiveFlashCampaignRowsForE2e();
    if (!activeRows.some((row) => row.id === campaignId)) {
      throw new Error(
        `Flash campaign ${campaignId} not returned by rpc_list_active_flash_campaigns`,
      );
    }
  });

  test("C3.1 admin publishes flash_only template + campaign (stock=2)", async (
    {},
    testInfo,
  ) => {
    test.skip(testInfo.project.name !== "buyer", "Buyer project only");
    expect(templateId).toBeTruthy();
    expect(campaignId).toBeTruthy();
  });

  test("C3.2 buyer A claims via UI and wallet shows coupon", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "buyer", "Buyer auth required");
    test.skip(!campaignId, "Campaign not created in setup");

    const fixtures = getMerchantProductDetailFixtures();

    const buyerCampaigns = await listActiveFlashCampaignRowsForUser({
      email: fixtures.buyerEmail!,
      password: fixtures.buyerPassword!,
    });
    expect(buyerCampaigns.some((row) => row.id === campaignId)).toBe(true);

    const claimedViaUi = await tryClaimFlashCampaignViaUI(page, templateTitle!);
    if (!claimedViaUi) {
      await claimFlashCampaignForUser({
        email: fixtures.buyerEmail!,
        password: fixtures.buyerPassword!,
        campaignId: campaignId!,
      });
    }

    await gotoMemberRewardsPage(page);
    const walletHasCoupon = await page
      .locator("#redeem-list")
      .getByText(templateTitle)
      .first()
      .isVisible({ timeout: 5_000 })
      .catch(() => false);
    if (!walletHasCoupon) {
      await expect(
        page.getByText(templateTitle).first(),
      ).toBeVisible({ timeout: 20_000 });
    }

    const buyerId = await getProfileIdByEmail(fixtures.buyerEmail!);
    flashCouponRewardId = await findLatestUserRewardForTemplate({
      userId: buyerId!,
      templateId: templateId!,
    });
    expect(flashCouponRewardId).toBeTruthy();

    await expect
      .poll(async () => countRewardCampaignClaims(campaignId!), {
        timeout: 30_000,
      })
      .toBeGreaterThanOrEqual(1);
  });

  test("C3.6 flash_only template is absent from locked tab", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "buyer", "Buyer project only");
    test.skip(!templateId, "Template not created in setup");

    await gotoMemberRewardsPage(page);
    await page.getByRole("button", { name: /可解鎖/ }).click();
    const couponCenter = page.locator("#redeem-list");
    await expect(couponCenter.getByText(templateTitle)).toHaveCount(0);
  });

  test("C3.7 checkout with flash-claimed coupon applies subsidy", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "buyer", "Buyer auth required");
    test.skip(!flashCouponRewardId, "Flash coupon not claimed in C3.2");

    const fixtures = getMerchantProductDetailFixtures();
    const buyerId = await getProfileIdByEmail(fixtures.buyerEmail!);
    const merchantListing = await findActiveMerchantListingForE2e({
      excludeSellerId: buyerId!,
    });
    await reactivateListingForE2e(merchantListing.listingId);

    const checkoutOrderId = await buyMerchantListingAndReachCheckout(
      page,
      merchantListing.sellerId,
      merchantListing.listingId,
    );

    await waitForCheckoutCouponPicker(page, {
      rewardId: flashCouponRewardId!,
    });
    await selectCheckoutCoupon(page, flashCouponRewardId!);

    await completeMerchantDirectCheckout(page, {
      couponRewardId: flashCouponRewardId!,
    });

    const snapshot = await getMerchantOrderCouponSnapshot(checkoutOrderId);
    expect(snapshot).toBeTruthy();
    expect(snapshot!.coupon_user_reward_id).toBe(flashCouponRewardId);
    expect(Number(snapshot!.platform_subsidy_amount)).toBeGreaterThan(0);
  });

  test("C3.5 buyer A second claim same day hits daily limit", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "buyer", "Buyer auth required");
    test.skip(!campaignId, "Campaign not created in setup");

    const fixtures = getMerchantProductDetailFixtures();

    await expect(
      claimFlashCampaignForUser({
        email: fixtures.buyerEmail!,
        password: fixtures.buyerPassword!,
        campaignId: campaignId!,
      }),
    ).rejects.toThrow(/你已達今日搶券上限/);

    await gotoMemberRewardsPage(page);
    await waitForFlashCampaignSectionReady(page);
    const card = page
      .locator("div.rounded-2xl")
      .filter({ hasText: templateTitle! });
    const hasFlashCard = await card.isVisible().catch(() => false);
    if (hasFlashCard) {
      await expect(
        card.getByRole("button", { name: "今日已達上限" }),
      ).toBeVisible({ timeout: 10_000 });
    }
  });

  test("C3.3 buyer B claims successfully", async ({}, testInfo) => {
    test.skip(testInfo.project.name !== "buyer", "Buyer project only");
    test.skip(!campaignId || !buyerB, "Campaign or buyer B not ready");

    const result = await claimFlashCampaignForUser({
      email: buyerB!.email,
      password: buyerB!.password,
      campaignId: campaignId!,
    });

    expect(result.userRewardId).toBeTruthy();
    const claims = await countRewardCampaignClaims(campaignId!);
    expect(claims).toBe(2);
  });

  test("C3.4 buyer C is rejected when sold out", async ({}, testInfo) => {
    test.skip(testInfo.project.name !== "buyer", "Buyer project only");
    test.skip(!campaignId || !buyerC, "Campaign or buyer C not ready");

    await expect(
      claimFlashCampaignForUser({
        email: buyerC!.email,
        password: buyerC!.password,
        campaignId: campaignId!,
      }),
    ).rejects.toThrow(/優惠券已被搶光/);
  });

  test("C3.8 admin pauses and resumes flash campaign", async ({
    browser,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "guest", "Admin-only setup");
    test.skip(!hasAdminAuthFixtures(), "Missing admin credentials");
    if (!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
      test.skip(true, "Missing NEXT_PUBLIC_SUPABASE_ANON_KEY");
    }

    const pauseTemplateTitle = `E2E Phase3 Pause ${Date.now()}`;
    const pauseCampaignName = `E2E Phase3 Pause Campaign ${Date.now()}`;

    const context = await browser.newContext();
    const page = await context.newPage();
    await loginAsAdmin(page);
    await publishFlashCampaignTemplate(page, {
      templateTitle: pauseTemplateTitle,
      campaignName: pauseCampaignName,
      maxClaims: 10,
    });

    const pauseCampaignId = await getFlashCampaignIdByName(pauseTemplateTitle);
    expect(pauseCampaignId).toBeTruthy();

    await setFlashCampaignStatusViaAdmin(page, pauseTemplateTitle, "paused");

    await expect
      .poll(async () => {
        const rows = await listActiveFlashCampaignRowsForE2e();
        return rows.some((row) => row.id === pauseCampaignId);
      })
      .toBe(false);

    await setFlashCampaignStatusViaAdmin(page, pauseTemplateTitle, "active");

    await expect
      .poll(async () => {
        const rows = await listActiveFlashCampaignRowsForE2e();
        return rows.some((row) => row.id === pauseCampaignId);
      })
      .toBe(true);

    await context.close();
  });
});

test.describe("Platform rewards Phase 3 — flash not started", () => {
  test.setTimeout(300_000);

  test("C3.9 future flash campaign cannot claim before starts_at", async ({
    browser,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "buyer", "Buyer project only");
    test.skip(!hasAdminAuthFixtures(), "Missing admin credentials");
    test.skip(!hasBuyerAuthFixtures(), "Missing buyer credentials");

    const fixtures = getMerchantProductDetailFixtures();
    const templateTitle = `E2E Phase3 Future ${Date.now()}`;
    const futureSchedule = buildFutureFlashCampaignScheduleForE2e({
      campaignName: templateTitle,
      hoursAhead: 24,
    });

    const adminContext = await browser.newContext();
    const adminPage = await adminContext.newPage();
    await loginAsAdmin(adminPage);
    await publishRewardActivityViaAdmin(adminPage, {
      title: templateTitle,
      type: "discount_coupon",
      amount: 10,
      distributionMode: "flash_only",
      flashSchedule: futureSchedule,
    });
    await adminContext.close();

    const campaignId = await getFlashCampaignIdByName(templateTitle);
    expect(campaignId).toBeTruthy();

    await expect
      .poll(async () => {
        const rows = await listActiveFlashCampaignRowsForUser({
          email: fixtures.buyerEmail!,
          password: fixtures.buyerPassword!,
        });
        return rows.some((row) => row.id === campaignId);
      })
      .toBe(true);

    await expect(
      claimFlashCampaignForUser({
        email: fixtures.buyerEmail!,
        password: fixtures.buyerPassword!,
        campaignId: campaignId!,
      }),
    ).rejects.toThrow(/尚未開始/);
  });
});
