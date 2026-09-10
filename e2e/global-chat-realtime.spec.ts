import { test, expect, type Page } from "@playwright/test";
import {
  getChatRealtimeFixtures,
  hasChatRealtimeFixtures,
} from "./fixtures/chat-test-data";
import {
  ensureDbChatRoom,
  ensureListingActive,
  getLatestChatMessageForParties,
  getLatestOfferForListing,
  getListingMarketplaceFixture,
  getListingSellerId,
  getProfileDisplayName,
  getProfileIdByEmail,
  resetE2eListingTradingFixture,
} from "./fixtures/supabase-admin";
import {
  acceptOfferAsSeller,
  chatComposer,
  chatConsoleRoot,
  ensureChatRoomActive,
  offerAmountFromListingPrice,
  offerAmountLabelFromListingPrice,
  offerCardWithAmount,
  openChatRoom,
  submitBuyerOfferFromDetail,
  waitForAmlSystemWarningInChat,
  waitForBuyerOfferCardAccepted,
  waitForSellerOfferCardVisible,
} from "./helpers/member-trading";

const SENSITIVE_CHAT_MESSAGE = "你好，可唔可以私下過數？";

test.describe.configure({ mode: "serial" });

test.use({ viewport: { width: 1280, height: 900 } });

test.setTimeout(300_000);

async function sendChatMessage(page: Page, text: string): Promise<void> {
  const composer = chatComposer(page);
  await composer.locator('input[type="text"]').fill(text);
  await composer.getByRole("button", { name: "發送 ⚡" }).click();
}

test.describe("Global Chat realtime — dual browser journey", () => {
  test("AML filter → realtime OfferCard → seller accept sync", async ({
    browser,
  }) => {
    if (!hasChatRealtimeFixtures()) {
      test.skip(
        true,
        "Missing Global Chat E2E env (seller/buyer auth, listing, or SUPABASE_SERVICE_ROLE_KEY)",
      );
    }

    const fixtures = getChatRealtimeFixtures();
    const sellerId = fixtures.sellerId!;
    const listingId = fixtures.listingId!;
    const buyerEmail = fixtures.buyerEmail!;

    const listingOwnerId = await getListingSellerId(listingId);
    if (!listingOwnerId || listingOwnerId !== sellerId) {
      test.skip(
        true,
        `Fixture mismatch: E2E_LISTING_ID owner is ${listingOwnerId ?? "unknown"} but E2E_SELLER_ID is ${sellerId}. Align seller credentials with listing owner.`,
      );
    }

    const buyerId = await getProfileIdByEmail(buyerEmail);
    if (!buyerId) {
      test.skip(true, `Could not resolve buyer profile for ${buyerEmail}`);
      return;
    }

    let roomId = await ensureDbChatRoom(buyerId, sellerId);
    await resetE2eListingTradingFixture({ listingId, buyerId, sellerId });
    await ensureListingActive(listingId);
    const listingFixtureResult = await getListingMarketplaceFixture(listingId, {
      expectedSellerId: sellerId,
    });
    if (!listingFixtureResult.ok) {
      test.skip(true, listingFixtureResult.skipReason);
      return;
    }
    const offerAmount = offerAmountFromListingPrice(
      listingFixtureResult.fixture.listingPrice,
    );
    const offerAmountLabel = offerAmountLabelFromListingPrice(
      listingFixtureResult.fixture.listingPrice,
    );
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
      await openChatRoom(buyerPage, roomId, sellerDisplayName, sellerId);
      await openChatRoom(sellerPage, roomId, buyerDisplayName, buyerId);

      // ── Step 1: AML / sensitive-word filter ──────────────────────────────
      await test.step("Step 1 — AML sensitive message + realtime warning", async () => {
        await sendChatMessage(buyerPage, SENSITIVE_CHAT_MESSAGE);

        await expect
          .poll(
            async () => {
              const row = await getLatestChatMessageForParties(
                buyerId,
                sellerId,
                "私下過數",
              );
              return row?.is_system_warning === true;
            },
            { timeout: 30_000 },
          )
          .toBe(true);

        const warningRow = await getLatestChatMessageForParties(
          buyerId,
          sellerId,
          "私下過數",
        );
        const warningRoomId = warningRow?.room_id ?? roomId;
        roomId = warningRoomId;

        await waitForAmlSystemWarningInChat(buyerPage, SENSITIVE_CHAT_MESSAGE);

        await waitForAmlSystemWarningInChat(sellerPage, SENSITIVE_CHAT_MESSAGE, {
          roomId: warningRoomId,
          partnerName: buyerDisplayName,
          partnerId: buyerId,
        });

        await expect(
          chatConsoleRoot(buyerPage).getByText("🛡️ 安全聲明："),
        ).toBeVisible();
        await expect(
          chatConsoleRoot(sellerPage).getByText("🛡️ 安全聲明："),
        ).toBeVisible();
      });

      // ── Step 2: Realtime OfferCard (listing-derived amount) ────────────
      let offerId: string | null = null;

      await test.step("Step 2 — buyer submits offer; seller sees OfferCard", async () => {
        await resetE2eListingTradingFixture({ listingId, buyerId, sellerId });
        await ensureListingActive(listingId);

        await ensureChatRoomActive(
          sellerPage,
          roomId,
          buyerDisplayName,
          buyerId,
        );

        await submitBuyerOfferFromDetail(
          buyerPage,
          sellerId,
          listingId,
          offerAmount,
          { buyerId },
        );

        await expect
          .poll(
            async () => {
              const offer = await getLatestOfferForListing({
                listingId,
                buyerId,
              });
              offerId = offer?.id ?? null;
              if (offer?.room_id) {
                roomId = offer.room_id;
              }
              return offer?.status === "pending";
            },
            { timeout: 25_000 },
          )
          .toBe(true);

        if (!offerId) {
          throw new Error("Step 2 did not capture offerId after buyer submit");
        }

        await waitForSellerOfferCardVisible({
          sellerPage,
          roomId,
          buyerDisplayName,
          buyerId,
          amountLabel: offerAmountLabel,
          offerId,
        });

        const sellerOfferCard = offerCardWithAmount(sellerPage, offerAmountLabel);
        await expect(
          sellerOfferCard.getByRole("button", { name: "接受出價" }),
        ).toBeVisible({ timeout: 60_000 });
      });

      // ── Step 3: Seller accept → buyer CTA sync ───────────────────────────
      await test.step("Step 3 — seller accepts; buyer sees accepted state", async () => {
        if (!offerId) {
          throw new Error("Step 2 did not capture offerId for accept flow");
        }

        await acceptOfferAsSeller(
          sellerPage,
          roomId,
          buyerDisplayName,
          offerId,
          offerAmountLabel,
          buyerPage,
          sellerDisplayName,
          sellerId,
          buyerId,
        );

        await waitForBuyerOfferCardAccepted({
          buyerPage,
          roomId,
          sellerDisplayName,
          sellerId,
          amountLabel: offerAmountLabel,
          offerId,
        });

        const buyerOfferCard = offerCardWithAmount(buyerPage, offerAmountLabel).filter({
          has: buyerPage.getByText("● 已接受"),
        });
        await expect(
          buyerOfferCard.getByText("賣家已接受出價，商品已成功鎖定"),
        ).toBeVisible({ timeout: 30_000 });
        await expect(
          buyerOfferCard.getByText("等待賣家回應中"),
        ).toHaveCount(0);
      });
    } finally {
      await resetE2eListingTradingFixture({ listingId, buyerId, sellerId }).catch(
        () => undefined,
      );
      await ensureListingActive(listingId).catch(() => undefined);
      await buyerContext.close();
      await sellerContext.close();
    }
  });
});
