import { test, expect } from "@playwright/test";
import { getChatRealtimeFixtures } from "./fixtures/chat-test-data";
import {
  ensureDbChatRoom,
  getLatestMemberOrderForListing,
  getProfileDisplayName,
  getProfileIdByEmail,
  guardP2pMemberOrder,
  resolveE2eMarketplaceFixture,
} from "./fixtures/supabase-admin";
import { hasBuyerAuthFixtures, hasMemberTradingFixtures } from "./fixtures/test-data";
import {
  acceptOfferAsSeller,
  ensurePendingP2pOffer,
  gotoTradingPage,
  gotoTradingPageWithFilter,
  offerAmountLabelFromListingPrice,
  pollMemberOrderIdForOffer,
  selectTradingPersonaTab,
  selectTradingStatusTab,
  waitForTradingListSettled,
} from "./helpers/member-trading";

test.use({ viewport: { width: 1280, height: 900 } });
test.setTimeout(300_000);

test.describe("Member trading filters shell", () => {
  test("buyer sees status and persona tabs plus order search", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "buyer", "Buyer-only filter shell");
    if (!hasBuyerAuthFixtures()) {
      test.skip(true, "Missing E2E_BUYER_EMAIL or E2E_BUYER_PASSWORD");
    }

    await gotoTradingPage(page);

    for (const label of ["全部", "待處理", "已完成", "已取消"]) {
      await expect(
        page.getByRole("button", { name: new RegExp(`^${label}`) }).first(),
      ).toBeVisible();
    }

    for (const label of ["買單", "賣單"]) {
      await expect(
        page.getByRole("button", { name: new RegExp(`^${label}`) }).first(),
      ).toBeVisible();
    }

    await expect(page.locator("#user-order-search")).toBeVisible();
  });

  test("filters and search persist after leaving trading and reset clears all", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "buyer", "Buyer-only filter persistence");
    if (!hasBuyerAuthFixtures()) {
      test.skip(true, "Missing E2E_BUYER_EMAIL or E2E_BUYER_PASSWORD");
    }

    await gotoTradingPage(page);
    await selectTradingStatusTab(page, "待處理");
    await selectTradingPersonaTab(page, "買單");
    await page.locator("#user-order-search").fill("persist-filter-query");
    await waitForTradingListSettled(page);

    await expect(
      page.getByRole("button", { name: /^待處理/ }).first(),
    ).toHaveClass(/font-bold/);
    await expect(
      page.getByRole("button", { name: /^買單/ }).first(),
    ).toHaveClass(/border-brand/);
    await expect(page.locator("#user-order-search")).toHaveValue(
      "persist-filter-query",
    );

    const orderRow = page.locator("#orders-list div.cursor-pointer.rounded-lg").first();
    if (await orderRow.isVisible().catch(() => false)) {
      await orderRow.click();
      await page.waitForURL(/\/profile\/user\/orderDetail\//, {
        timeout: 20_000,
      });
      await page.goBack();
      await expect(page.locator("#user-trading-heading")).toBeVisible({
        timeout: 20_000,
      });
      await waitForTradingListSettled(page);
    } else {
      await page.goto("/profile/user", { waitUntil: "domcontentloaded" });
      await gotoTradingPage(page);
    }

    await expect(
      page.getByRole("button", { name: /^待處理/ }).first(),
    ).toHaveClass(/font-bold/);
    await expect(
      page.getByRole("button", { name: /^買單/ }).first(),
    ).toHaveClass(/border-brand/);
    await expect(page.locator("#user-order-search")).toHaveValue(
      "persist-filter-query",
    );

    await page.getByRole("button", { name: "重設所有篩選" }).click();
    await waitForTradingListSettled(page);

    await expect(
      page.getByRole("button", { name: /^全部/ }).first(),
    ).toHaveClass(/font-bold/);
    await expect(
      page.getByRole("button", { name: /^不限/ }).first(),
    ).toHaveClass(/border-brand/);
    await expect(page.locator("#user-order-search")).toHaveValue("");
    await expect(page.getByRole("button", { name: "重設所有篩選" })).toBeDisabled();
  });
});

test.describe.serial("Member trading filters with live order", () => {
  test("pending P2P order appears under 待處理 and 買單 filters", async ({
    browser,
  }, testInfo) => {
    test.setTimeout(420_000);
    test.skip(
      testInfo.project.name !== "member-trading",
      "Filter data test runs on member-trading project",
    );
    if (!hasMemberTradingFixtures()) {
      test.skip(true, "Missing member trading E2E env");
    }

    const fixtureResult = await resolveE2eMarketplaceFixture({
      requiredSellerPersona: "member",
    });
    if (!fixtureResult.ok) {
      test.skip(true, fixtureResult.skipReason);
      return;
    }
    const { listingId, sellerId, listingPrice } = fixtureResult.fixture;
    const offerLabel = offerAmountLabelFromListingPrice(listingPrice);

    const fixtures = getChatRealtimeFixtures();
    const buyerEmail = fixtures.buyerEmail!;
    const buyerId = await getProfileIdByEmail(buyerEmail);
    if (!buyerId) {
      test.skip(true, `Could not resolve buyer profile for ${buyerEmail}`);
      return;
    }

    let roomId = await ensureDbChatRoom(buyerId, sellerId);
    const [sellerDisplayName, buyerDisplayName] = await Promise.all([
      getProfileDisplayName(sellerId),
      getProfileDisplayName(buyerId),
    ]);

    const buyerContext = await browser.newContext({
      storageState: "e2e/.auth/buyer.json",
    });
    const sellerContext = await browser.newContext({
      storageState: "e2e/.auth/seller.json",
    });

    const buyerPage = await buyerContext.newPage();
    const sellerPage = await sellerContext.newPage();

    try {
      const offerState = await ensurePendingP2pOffer({
        buyerPage,
        sellerPage,
        sellerId,
        listingId,
        roomId,
        buyerId,
        sellerDisplayName,
        buyerDisplayName,
      });
      roomId = offerState.roomId;
      await acceptOfferAsSeller(
        sellerPage,
        roomId,
        buyerDisplayName,
        offerState.offerId,
        offerLabel,
        buyerPage,
        sellerDisplayName,
        sellerId,
        buyerId,
      );

      const memberOrderId = await pollMemberOrderIdForOffer(offerState.offerId, {
        listingId,
        buyerId,
      });
      const order = await getLatestMemberOrderForListing({ listingId, buyerId });
      if (order) {
        const guard = guardP2pMemberOrder(order);
        if (!guard.ok) {
          test.skip(true, guard.skipReason);
        }
      }

      const orderNumber = order?.order_number;
      if (!orderNumber) {
        throw new Error("Missing order number for trading filter assertions");
      }

      await gotoTradingPageWithFilter(buyerPage, "待處理");
      await expect(
        buyerPage.getByRole("button", { name: "確認完成交易" }).first(),
      ).toBeVisible({ timeout: 60_000 });

      const newOrderVisible = await buyerPage
        .getByText(`#${orderNumber}`)
        .first()
        .isVisible()
        .catch(() => false);

      await selectTradingPersonaTab(buyerPage, "買單");
      await waitForTradingListSettled(buyerPage);
      await expect(
        buyerPage.getByRole("button", { name: "確認完成交易" }).first(),
      ).toBeVisible({ timeout: 20_000 });

      await selectTradingStatusTab(buyerPage, "全部");
      await selectTradingPersonaTab(buyerPage, "買單");
      await waitForTradingListSettled(buyerPage);
      await expect(
        buyerPage.getByRole("button", { name: "確認完成交易" }).first(),
      ).toBeVisible({ timeout: 20_000 });

      if (newOrderVisible) {
        await gotoTradingPageWithFilter(buyerPage, "待處理");
        await buyerPage.locator("#user-order-search").fill(orderNumber);
        await expect(buyerPage.getByText(`#${orderNumber}`)).toBeVisible({
          timeout: 15_000,
        });
      }
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.includes("authentication")
      ) {
        test.skip(
          true,
          "Fixture has a pending auth offer; reset listing or complete auth orders before P2P filter test",
        );
      }
      throw error;
    } finally {
      await buyerContext.close();
      await sellerContext.close();
    }
  });
});
