import { test, expect } from "@playwright/test";
import { getChatRealtimeFixtures } from "./fixtures/chat-test-data";
import {
  ensureDbChatRoom,
  ensureListingActive,
  getLatestOfferForListing,
  getListingStatus,
  getOfferStatus,
  getProfileDisplayName,
  getProfileIdByEmail,
  isBuyerWithinP2pNewAccountGrace,
  resetE2eListingTradingFixture,
  resolveE2eMarketplaceFixture,
} from "./fixtures/supabase-admin";
import { hasMemberTradingFixtures } from "./fixtures/test-data";
import {
  modifiedOfferAmountFromListingPrice,
  modifiedOfferAmountLabelFromListingPrice,
  modifyBuyerOfferInChat,
  ensureChatRoomActive,
  offerAmountFromListingPrice,
  offerAmountLabelFromListingPrice,
  offerCardWithAmount,
  chatConsoleRoot,
  openBothChatRooms,
  openChatRoom,
  rejectOfferAsSeller,
  submitBuyerOfferFromDetail,
  waitForBuyerOfferCardRejected,
  waitForChatThreadReady,
  P2P_OFFER_AMOUNT,
  P2P_OFFER_AMOUNT_LABEL,
} from "./helpers/member-trading";

test.describe.configure({ mode: "serial" });
test.use({ viewport: { width: 1280, height: 900 } });
test.setTimeout(300_000);

test.describe("Member offer negotiation", () => {
  test("seller can reject a pending offer", async ({ browser }, testInfo) => {
    test.skip(
      testInfo.project.name !== "member-trading",
      "Dual-browser negotiation runs on member-trading project",
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
    const offerAmount = offerAmountFromListingPrice(listingPrice);
    const offerLabel = offerAmountLabelFromListingPrice(listingPrice);

    const fixtures = getChatRealtimeFixtures();
    const buyerEmail = fixtures.buyerEmail!;
    const buyerId = await getProfileIdByEmail(buyerEmail);
    if (!buyerId) {
      test.skip(true, `Could not resolve buyer profile for ${buyerEmail}`);
      return;
    }

    let roomId = await ensureDbChatRoom(buyerId, sellerId);
    await resetE2eListingTradingFixture({ listingId, buyerId, sellerId });
    await ensureListingActive(listingId);
    await expect
      .poll(async () => (await getListingStatus(listingId)) === "active", {
        timeout: 20_000,
      })
      .toBe(true);

    const listingStatus = await getListingStatus(listingId);
    if (listingStatus && listingStatus !== "active") {
      test.skip(
        true,
        `Listing ${listingId} is ${listingStatus}; reset E2E_LISTING_ID to an active seller listing`,
      );
    }

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

    let offerId: string | null = null;

    try {
      await openBothChatRooms(
        buyerPage,
        sellerPage,
        roomId,
        sellerDisplayName,
        buyerDisplayName,
      );

      await submitBuyerOfferFromDetail(
        buyerPage,
        sellerId,
        listingId,
        offerAmount,
        { buyerId },
      );
      await expect
        .poll(async () => {
          const offer = await getLatestOfferForListing({
            listingId,
            buyerId,
          });
          offerId = offer?.id ?? null;
          if (offer?.room_id) {
            roomId = offer.room_id;
          }
          return offer?.status === "pending" && !offer.use_authentication;
        }, { timeout: 25_000 })
        .toBe(true);

      if (!offerId) {
        throw new Error("Missing offerId for reject flow");
      }

      await rejectOfferAsSeller(
        sellerPage,
        roomId,
        buyerDisplayName,
        offerId,
        offerLabel,
        sellerId,
        buyerId,
      );

      await waitForBuyerOfferCardRejected({
        buyerPage,
        roomId,
        sellerDisplayName,
        sellerId,
        amountLabel: offerLabel,
        offerId: offerId!,
      });
    } finally {
      await buyerContext.close();
      await sellerContext.close();
    }
  });

  test("buyer can modify a pending offer once", async ({ browser }, testInfo) => {
    test.skip(
      testInfo.project.name !== "member-trading",
      "Dual-browser negotiation runs on member-trading project",
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
    const offerAmount = offerAmountFromListingPrice(listingPrice);
    const offerLabel = offerAmountLabelFromListingPrice(listingPrice);
    const modifyAmount = modifiedOfferAmountFromListingPrice(listingPrice);
    const modifyLabel = modifiedOfferAmountLabelFromListingPrice(listingPrice);

    const fixtures = getChatRealtimeFixtures();
    const buyerEmail = fixtures.buyerEmail!;
    const buyerId = await getProfileIdByEmail(buyerEmail);
    if (!buyerId) {
      test.skip(true, `Could not resolve buyer profile for ${buyerEmail}`);
      return;
    }

    let roomId = await ensureDbChatRoom(buyerId, sellerId);
    await resetE2eListingTradingFixture({ listingId, buyerId, sellerId });
    await ensureListingActive(listingId);
    await expect
      .poll(async () => (await getListingStatus(listingId)) === "active", {
        timeout: 20_000,
      })
      .toBe(true);

    const listingStatus = await getListingStatus(listingId);
    if (listingStatus && listingStatus !== "active") {
      test.skip(
        true,
        `Listing ${listingId} is ${listingStatus}; reset E2E_LISTING_ID to an active seller listing`,
      );
    }

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

    let offerId: string | null = null;

    try {
      await openBothChatRooms(
        buyerPage,
        sellerPage,
        roomId,
        sellerDisplayName,
        buyerDisplayName,
      );

      await submitBuyerOfferFromDetail(
        buyerPage,
        sellerId,
        listingId,
        offerAmount,
        { buyerId },
      );
      await expect
        .poll(async () => {
          const offer = await getLatestOfferForListing({
            listingId,
            buyerId,
          });
          offerId = offer?.id ?? null;
          if (offer?.room_id) {
            roomId = offer.room_id;
          }
          return (
            offer?.status === "pending" &&
            !offer.use_authentication &&
            (offer.modified_count ?? 0) === 0
          );
        }, { timeout: 25_000 })
        .toBe(true);

      if (!offerId) {
        throw new Error("Missing offerId before buyer modify");
      }

      await modifyBuyerOfferInChat(buyerPage, {
        roomId,
        sellerDisplayName,
        sellerId,
        offerId,
        listingId,
        buyerId,
        currentAmountLabel: offerLabel,
        modifyAmount,
      });

      await openChatRoom(sellerPage, roomId, buyerDisplayName, buyerId);
      await waitForChatThreadReady(sellerPage);
      await expect
        .poll(
          async () => {
            const modifiedMarker = await chatConsoleRoot(sellerPage)
              .getByText("● 出價已修改")
              .first()
              .isVisible()
              .catch(() => false);
            if (modifiedMarker) {
              return true;
            }

            const sellerOfferCard = offerCardWithAmount(
              sellerPage,
              modifyLabel,
            ).filter({
              has: sellerPage.getByRole("button", { name: "接受出價" }),
            });
            return sellerOfferCard.isVisible().catch(() => false);
          },
          { timeout: 90_000 },
        )
        .toBe(true);

      const sellerOfferCard = offerCardWithAmount(sellerPage, modifyLabel).filter({
        has: sellerPage.getByRole("button", { name: "接受出價" }),
      });
      if (await sellerOfferCard.isVisible().catch(() => false)) {
        await expect(
          sellerOfferCard.getByRole("button", { name: "接受出價" }),
        ).toBeVisible();
      }
    } finally {
      await buyerContext.close();
      await sellerContext.close();
    }
  });

  test("buyer under 14-day cap cannot modify offer above HK$300", async ({
    browser,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== "member-trading",
      "Dual-browser negotiation runs on member-trading project",
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
    const { listingId, sellerId } = fixtureResult.fixture;

    const fixtures = getChatRealtimeFixtures();
    const buyerEmail = fixtures.buyerEmail!;
    const buyerId = await getProfileIdByEmail(buyerEmail);
    if (!buyerId) {
      test.skip(true, `Could not resolve buyer profile for ${buyerEmail}`);
      return;
    }
    if (!(await isBuyerWithinP2pNewAccountGrace(buyerId))) {
      test.skip(
        true,
        "E2E buyer is older than 14 days — AML HK$300 cap no longer applies",
      );
      return;
    }

    let roomId = await ensureDbChatRoom(buyerId, sellerId);
    await resetE2eListingTradingFixture({ listingId, buyerId, sellerId });
    await ensureListingActive(listingId);
    await expect
      .poll(async () => (await getListingStatus(listingId)) === "active", {
        timeout: 20_000,
      })
      .toBe(true);

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
      await openBothChatRooms(
        buyerPage,
        sellerPage,
        roomId,
        sellerDisplayName,
        buyerDisplayName,
      );

      await submitBuyerOfferFromDetail(
        buyerPage,
        sellerId,
        listingId,
        P2P_OFFER_AMOUNT,
        { buyerId },
      );

      await expect
        .poll(async () => {
          const offer = await getLatestOfferForListing({
            listingId,
            buyerId,
          });
          if (offer?.room_id) {
            roomId = offer.room_id;
          }
          return offer?.status === "pending" && !offer.use_authentication;
        }, { timeout: 25_000 })
        .toBe(true);

      await ensureChatRoomActive(buyerPage, roomId, sellerDisplayName);
      const buyerOfferCard = offerCardWithAmount(
        buyerPage,
        P2P_OFFER_AMOUNT_LABEL,
      ).filter({
        has: buyerPage.getByRole("button", { name: "修改出價" }),
      });
      await expect(buyerOfferCard).toBeVisible({ timeout: 45_000 });
      await buyerOfferCard.getByRole("button", { name: "修改出價" }).click();
      await buyerPage.locator('input[type="number"]').last().fill("500");
      await buyerPage.getByRole("button", { name: "確認送出" }).click();

      await expect(
        buyerPage.getByText("新註冊帳號（14 天內）面交單筆上限為 HK$300").first(),
      ).toBeVisible({ timeout: 20_000 });
    } finally {
      await buyerContext.close();
      await sellerContext.close();
    }
  });
});
