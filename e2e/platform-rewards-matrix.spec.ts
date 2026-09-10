import { test, expect, type Page } from "@playwright/test";
import { SEED_REWARD_TEMPLATE_IDS } from "@/lib/constants/rewards";
import {
  buildFlashCampaignScheduleForE2e,
  buildOpenActivityWindowForE2e,
  clearUserRewardsForTemplateForE2e,
  ensureE2eFlashBuyer,
  findLatestUserRewardForTemplate,
  getPointLedgerGrantForTemplate,
  getRewardCouponCenterForUser,
  getRewardTemplateIdByTitle,
  gotoMemberRewardsPage,
  invokeAutoGrantForUser,
  openAdminCampaignsActivitiesTab,
  openAdminCheckInTab,
  publishRewardActivityViaAdmin,
  setProfileCompletedTradesCount,
} from "./helpers/platform-rewards";
import { getProfileIdByEmail } from "./fixtures/supabase-admin";
import {
  getMerchantProductDetailFixtures,
  hasAdminAuthFixtures,
  hasBuyerAuthFixtures,
} from "./fixtures/test-data";
import {
  readRewardsMatrixBootstrap,
  writeRewardsMatrixBootstrap,
} from "./helpers/rewards-matrix-state";

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
    timeout: 30_000,
  });
}

function buildOpenActivityWindow() {
  return buildOpenActivityWindowForE2e();
}

test.describe.configure({ mode: "serial" });
test.use({ viewport: { width: 1280, height: 900 } });
test.setTimeout(300_000);

test.beforeEach(({}, testInfo) => {
  test.skip(
    !["guest", "buyer"].includes(testInfo.project.name),
    "Matrix runs on guest + buyer projects only",
  );
});

test.describe("Platform rewards full matrix", () => {
  const cachedBootstrap = readRewardsMatrixBootstrap();
  const stamp = cachedBootstrap?.stamp ?? Date.now();
  const tradeDiscountTitle =
    cachedBootstrap?.tradeDiscountTitle ??
    `E2E Matrix Trade Discount ${stamp}`;
  const tradeFreeShipTitle =
    cachedBootstrap?.tradeFreeShipTitle ?? `E2E Matrix Trade FreeShip ${stamp}`;
  const tradePointsTitle =
    cachedBootstrap?.tradePointsTitle ?? `E2E Matrix Trade Points ${stamp}`;
  const lockedProgressTitle =
    cachedBootstrap?.lockedProgressTitle ??
    `E2E Matrix Locked Progress ${stamp}`;
  const flashFreeShipTitle =
    cachedBootstrap?.flashFreeShipTitle ?? `E2E Matrix Flash FreeShip ${stamp}`;
  const flashFreeShipCampaign = `E2E Matrix Flash FS Campaign ${stamp}`;

  let tradeDiscountTemplateId: string | null =
    cachedBootstrap?.tradeDiscountTemplateId ?? null;
  let tradeFreeShipTemplateId: string | null =
    cachedBootstrap?.tradeFreeShipTemplateId ?? null;
  let tradePointsTemplateId: string | null =
    cachedBootstrap?.tradePointsTemplateId ?? null;
  let lockedProgressTemplateId: string | null =
    cachedBootstrap?.lockedProgressTemplateId ?? null;
  let flashFreeShipTemplateId: string | null =
    cachedBootstrap?.flashFreeShipTemplateId ?? null;
  let autoGrantUserId: string | null =
    cachedBootstrap?.autoGrantUserId ?? null;

  test.beforeAll(async ({ browser }, testInfo) => {
    test.setTimeout(480_000);

    if (testInfo.project.name === "buyer") {
      if (!cachedBootstrap) {
        throw new Error(
          "Missing rewards matrix bootstrap cache; run guest project first",
        );
      }
      return;
    }

    if (cachedBootstrap) {
      return;
    }

    test.skip(!hasAdminAuthFixtures(), "Missing admin credentials");
    test.skip(!process.env.SUPABASE_SERVICE_ROLE_KEY, "Missing service role key");

    const autoGrantUser = await ensureE2eFlashBuyer({ suffix: "matrix-grant" });
    autoGrantUserId = autoGrantUser.userId;
    const activityWindow = buildOpenActivityWindow();

    const context = await browser.newContext();
    const page = await context.newPage();
    await loginAsAdmin(page);

    await publishRewardActivityViaAdmin(page, {
      title: tradeDiscountTitle,
      type: "discount_coupon",
      amount: 15,
      minSpend: 0,
      trigger: { kind: "trade_count", role: "buyer", count: 1 },
      activityWindow,
    });

    await publishRewardActivityViaAdmin(page, {
      title: tradeFreeShipTitle,
      type: "free_shipping",
      maxSubsidy: 25,
      trigger: { kind: "trade_count", role: "buyer", count: 1 },
      activityWindow,
    });

    await publishRewardActivityViaAdmin(page, {
      title: tradePointsTitle,
      type: "points",
      points: 77,
      trigger: { kind: "trade_count", role: "buyer", count: 1 },
      activityWindow,
    });

    await publishRewardActivityViaAdmin(page, {
      title: lockedProgressTitle,
      type: "discount_coupon",
      amount: 5,
      minSpend: 0,
      trigger: { kind: "trade_count", role: "buyer", count: 5 },
      activityWindow,
    });

    const flashSchedule = buildFlashCampaignScheduleForE2e({
      campaignName: flashFreeShipCampaign,
      maxClaims: 3,
      maxClaimsPerUser: 1,
    });
    await publishRewardActivityViaAdmin(page, {
      title: flashFreeShipTitle,
      type: "free_shipping",
      maxSubsidy: 20,
      distributionMode: "flash_only",
      flashSchedule,
    });

    await context.close();

    tradeDiscountTemplateId = await getRewardTemplateIdByTitle(tradeDiscountTitle);
    tradeFreeShipTemplateId = await getRewardTemplateIdByTitle(tradeFreeShipTitle);
    tradePointsTemplateId = await getRewardTemplateIdByTitle(tradePointsTitle);
    lockedProgressTemplateId = await getRewardTemplateIdByTitle(lockedProgressTitle);
    flashFreeShipTemplateId = await getRewardTemplateIdByTitle(flashFreeShipTitle);

    if (
      !tradeDiscountTemplateId ||
      !tradeFreeShipTemplateId ||
      !tradePointsTemplateId ||
      !lockedProgressTemplateId ||
      !flashFreeShipTemplateId ||
      !autoGrantUserId
    ) {
      throw new Error("Failed to bootstrap matrix reward templates");
    }

    writeRewardsMatrixBootstrap({
      stamp,
      tradeDiscountTitle,
      tradeFreeShipTitle,
      tradePointsTitle,
      lockedProgressTitle,
      flashFreeShipTitle,
      tradeDiscountTemplateId,
      tradeFreeShipTemplateId,
      tradePointsTemplateId,
      lockedProgressTemplateId,
      flashFreeShipTemplateId,
      autoGrantUserId,
    });
  });

  test("M-A1 admin campaigns activities tab loads", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "guest", "Admin-only");
    test.skip(!hasAdminAuthFixtures(), "Missing admin credentials");

    await loginAsAdmin(page);
    await openAdminCampaignsActivitiesTab(page);
    await expect(
      page
        .getByRole("button", { name: "新增活動" })
        .or(page.getByRole("button", { name: "新增一般券" })),
    ).toBeVisible();
  });

  test("M-A2 admin check-in tab loads", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "guest", "Admin-only");
    test.skip(!hasAdminAuthFixtures(), "Missing admin credentials");

    await loginAsAdmin(page);
    await openAdminCheckInTab(page);
    const saveButton = page.getByRole("button", { name: /儲存簽到計劃/ });
    if (await saveButton.isVisible().catch(() => false)) {
      await expect(saveButton).toBeVisible();
      return;
    }
    await expect(page.getByText("找不到簽到計劃")).toBeVisible();
  });

  test("M-A3 admin publishes all reward types (matrix bootstrap)", async (
    {},
    testInfo,
  ) => {
    test.skip(testInfo.project.name !== "guest", "Admin-only");
    expect(tradeDiscountTemplateId).toBeTruthy();
    expect(tradeFreeShipTemplateId).toBeTruthy();
    expect(tradePointsTemplateId).toBeTruthy();
    expect(lockedProgressTemplateId).toBeTruthy();
    expect(flashFreeShipTemplateId).toBeTruthy();
  });

  test("M-G1 trade_count auto-grants discount coupon", async ({}, testInfo) => {
    test.skip(testInfo.project.name !== "guest", "Service-role assertions");
    test.skip(!autoGrantUserId || !tradeDiscountTemplateId, "Bootstrap missing");

    await setProfileCompletedTradesCount(autoGrantUserId!, 1);
    await invokeAutoGrantForUser(autoGrantUserId!);

    const rewardId = await findLatestUserRewardForTemplate({
      userId: autoGrantUserId!,
      templateId: tradeDiscountTemplateId!,
    });
    expect(rewardId).toBeTruthy();
  });

  test("M-G2 trade_count auto-grants free_shipping coupon", async (
    {},
    testInfo,
  ) => {
    test.skip(testInfo.project.name !== "guest", "Service-role assertions");
    test.skip(!autoGrantUserId || !tradeFreeShipTemplateId, "Bootstrap missing");

    const rewardId = await findLatestUserRewardForTemplate({
      userId: autoGrantUserId!,
      templateId: tradeFreeShipTemplateId!,
    });
    expect(rewardId).toBeTruthy();
  });

  test("M-G3 trade_count auto-grants points to balance", async ({}, testInfo) => {
    test.skip(testInfo.project.name !== "guest", "Service-role assertions");
    test.skip(!autoGrantUserId || !tradePointsTemplateId, "Bootstrap missing");

    const pointsGrant = await getPointLedgerGrantForTemplate({
      userId: autoGrantUserId!,
      templateId: tradePointsTemplateId!,
    });
    expect(pointsGrant).toBeGreaterThanOrEqual(77);
  });

  test("M-M1 locked tab shows trade_count progress via coupon center", async (
    { page },
    testInfo,
  ) => {
    test.skip(testInfo.project.name !== "buyer", "Buyer auth required");
    test.skip(!hasBuyerAuthFixtures(), "Missing buyer credentials");
    test.skip(!lockedProgressTemplateId, "Bootstrap missing");

    const fixtures = getMerchantProductDetailFixtures();
    const buyerId = await getProfileIdByEmail(fixtures.buyerEmail!);
    expect(buyerId).toBeTruthy();

    await clearUserRewardsForTemplateForE2e({
      userId: buyerId!,
      templateId: lockedProgressTemplateId!,
    });
    await setProfileCompletedTradesCount(buyerId!, 1);
    await invokeAutoGrantForUser(buyerId!);

    const center = await getRewardCouponCenterForUser({
      email: fixtures.buyerEmail!,
      password: fixtures.buyerPassword!,
    });

    const locked = center.locked.find(
      (entry) => entry.name === lockedProgressTitle,
    );
    expect(locked).toBeTruthy();
    expect(locked?.progressCurrent).toBeGreaterThanOrEqual(1);
    expect(locked?.progressRequired).toBe(5);
  });

  test("M-M2 archived check-in seed template absent from locked tab", async (
    {},
    testInfo,
  ) => {
    test.skip(testInfo.project.name !== "buyer", "Buyer auth required");
    test.skip(!hasBuyerAuthFixtures(), "Missing buyer credentials");

    const fixtures = getMerchantProductDetailFixtures();
    const buyerId = await getProfileIdByEmail(fixtures.buyerEmail!);
    expect(buyerId).toBeTruthy();
    const center = await getRewardCouponCenterForUser({
      email: fixtures.buyerEmail!,
      password: fixtures.buyerPassword!,
    });

    const legacyTitles = center.locked.map((entry) => entry.name.toLowerCase());
    expect(
      center.locked.some(
        (entry) => entry.id === SEED_REWARD_TEMPLATE_IDS.CHECK_IN_DAY7_BONUS,
      ),
    ).toBe(false);
    expect(legacyTitles.some((title) => title.includes("簽到"))).toBe(false);
  });

  test("M-M3 flash_only free_shipping absent from locked tab", async (
    { page },
    testInfo,
  ) => {
    test.skip(testInfo.project.name !== "buyer", "Buyer auth required");
    test.skip(!flashFreeShipTemplateId, "Bootstrap missing");

    const fixtures = getMerchantProductDetailFixtures();
    const buyerId = await getProfileIdByEmail(fixtures.buyerEmail!);
    expect(buyerId).toBeTruthy();
    const center = await getRewardCouponCenterForUser({
      email: fixtures.buyerEmail!,
      password: fixtures.buyerPassword!,
    });

    expect(
      center.locked.some((entry) => entry.name === flashFreeShipTitle),
    ).toBe(false);

    await gotoMemberRewardsPage(page);
    await page.getByRole("button", { name: /可解鎖/ }).click();
    const couponCenter = page.locator("#redeem-list");
    await expect(couponCenter.getByText(flashFreeShipTitle)).toHaveCount(0);
  });
});
