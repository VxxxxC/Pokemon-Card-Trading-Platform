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
import { hasMemberTradingFixtures } from "./fixtures/test-data";
import {
  acceptOfferAsSeller,
  ensurePendingP2pOffer,
  gotoOrderDetail,
  offerAmountLabelFromListingPrice,
  pollMemberOrderIdForOffer,
} from "./helpers/member-trading";

test.use({ viewport: { width: 1280, height: 900 } });
test.setTimeout(300_000);

test.describe("Member order detail — P2P", () => {
  test("P2P order detail shows handover CTA, not mock pay", async ({
    browser,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== "member-trading",
      "Order detail P2P CTA runs on member-trading project",
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

      let memberOrderId = await pollMemberOrderIdForOffer(offerState.offerId, {
        listingId,
        buyerId,
      });
      const order = await getLatestMemberOrderForListing({ listingId, buyerId });
      if (order) {
        const guard = guardP2pMemberOrder(order);
        if (!guard.ok) {
          test.skip(true, guard.skipReason);
        }
        memberOrderId = order.id;
      }

      await gotoOrderDetail(buyerPage, memberOrderId);

      await expect(
        buyerPage.getByRole("button", { name: "確認完成交易" }),
      ).toBeVisible({ timeout: 15_000 });
      await expect(
        buyerPage.getByText(/尚未完成託管付款/),
      ).toHaveCount(0);

      await buyerPage.getByRole("link", { name: "返回交易管理" }).click();
      await expect(buyerPage).toHaveURL(/\/profile\/user\/trading/);
      await expect(buyerPage.locator("#user-trading-heading")).toBeVisible();
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.includes("authentication")
      ) {
        test.skip(
          true,
          "Fixture has a pending auth offer; reset listing before P2P order-detail test",
        );
      }
      throw error;
    } finally {
      await buyerContext.close();
      await sellerContext.close();
    }
  });
});
