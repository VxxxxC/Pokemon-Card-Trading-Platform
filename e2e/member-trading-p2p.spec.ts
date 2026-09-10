import { test, expect } from "@playwright/test";
import { getChatRealtimeFixtures } from "./fixtures/chat-test-data";
import {
  ensureDbChatRoom,
  getLatestMemberOrderForListing,
  getMemberOrderById,
  getProfileDisplayName,
  getProfileIdByEmail,
  getReviewForMemberOrder,
  guardP2pMemberOrder,
  resolveE2eMarketplaceFixture,
} from "./fixtures/supabase-admin";
import { hasMemberTradingFixtures } from "./fixtures/test-data";
import { ensureMemberPersona } from "./helpers/collection-asset";
import {
  acceptOfferAsSeller,
  confirmP2pHandoverDialog,
  dismissBlockingOverlays,
  ensurePendingP2pOffer,
  gotoOrderDetail,
  offerAmountFromListingPrice,
  offerAmountLabelFromListingPrice,
  pollMemberOrderIdForOffer,
  submitFiveStarReview,
  waitForBuyerP2pCompleteOnTradingList,
} from "./helpers/member-trading";
import { suppressTransientHomeOverlays } from "./helpers/overlays";

test.describe.configure({ mode: "serial" });
test.use({ viewport: { width: 1280, height: 900 } });
test.setTimeout(480_000);

test.describe("Member P2P trading closure", () => {
  test("offer accept → trading list → complete → review", async ({
    browser,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== "member-trading",
      "Dual-browser P2P closure runs on member-trading project",
    );
    if (!hasMemberTradingFixtures()) {
      test.skip(
        true,
        "Missing member trading E2E env (seller/buyer auth, listing, or SUPABASE_SERVICE_ROLE_KEY)",
      );
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

    let offerId: string | null = null;
    let memberOrderId: string | null = null;
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
    await ensureMemberPersona(buyerPage);
    await suppressTransientHomeOverlays(buyerPage);
    await suppressTransientHomeOverlays(sellerPage);

    try {
      await test.step("Step 1 — buyer submits P2P offer without authentication", async () => {
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
        offerId = offerState.offerId;
        roomId = offerState.roomId;
      });

      await test.step("Step 2 — seller accepts offer in chat", async () => {
        if (!offerId) {
          throw new Error("Missing offerId after Step 1");
        }

        await acceptOfferAsSeller(
          sellerPage,
          roomId,
          buyerDisplayName,
          offerId,
          offerLabel,
          buyerPage,
          sellerDisplayName,
          sellerId,
          buyerId,
        );
      });

      await test.step("Step 3 — member_orders row is P2P pending", async () => {
        memberOrderId = await pollMemberOrderIdForOffer(offerId!, {
          listingId,
          buyerId,
        });

        const order = await getLatestMemberOrderForListing({
          listingId,
          buyerId,
        });

        if (order) {
          const guard = guardP2pMemberOrder(order);
          if (!guard.ok) {
            test.skip(true, guard.skipReason);
          }
          expect(order.status).toBe("pending");
          memberOrderId = order.id;
        }
      });

      await test.step("Step 4 — buyer sees P2P order on trading list", async () => {
        const order = memberOrderId
          ? await getMemberOrderById(memberOrderId)
          : null;

        await waitForBuyerP2pCompleteOnTradingList(buyerPage, {
          orderNumber: order?.order_number ?? null,
          memberOrderId,
        });
      });

      await test.step("Step 4b — buyer completes handover from trading list", async () => {
        const order = memberOrderId
          ? await getMemberOrderById(memberOrderId)
          : null;
        await buyerPage.goto(
          `/profile/user/trading?filter=${encodeURIComponent("待處理")}`,
          { waitUntil: "domcontentloaded" },
        );
        await dismissBlockingOverlays(buyerPage);
        await confirmP2pHandoverDialog(buyerPage, {
          orderNumber: order?.order_number ?? null,
        });
        await expect
          .poll(
            async () =>
              memberOrderId
                ? (await getMemberOrderById(memberOrderId))?.status ?? null
                : null,
            { timeout: 30_000 },
          )
          .toBe("completed");
      });

      await test.step("Step 5 — order detail shows P2P meetup path", async () => {
        if (!memberOrderId) {
          throw new Error("Missing memberOrderId before order detail");
        }
        await gotoOrderDetail(buyerPage, memberOrderId);

        await expect(
          buyerPage.getByRole("button", { name: "確認完成交易" }),
        ).toHaveCount(0);
        await expect(
          buyerPage.getByRole("button", { name: "前往付款" }),
        ).toHaveCount(0);
        await expect(
          buyerPage.getByText("測試模式 — Stripe 尚未接入"),
        ).toHaveCount(0);
      });

      await test.step("Step 6 — completed order detail is stable on reload", async () => {
        if (!memberOrderId) {
          throw new Error("Missing memberOrderId before handover");
        }
        await gotoOrderDetail(buyerPage, memberOrderId);
        await dismissBlockingOverlays(buyerPage);

        await expect(
          buyerPage.getByRole("button", { name: "確認完成交易" }),
        ).toHaveCount(0);
      });

      await test.step("Step 7 — buyer submits review", async () => {
        if (!memberOrderId) {
          throw new Error("Missing memberOrderId before review");
        }
        const completed = await getMemberOrderById(memberOrderId);
        expect(completed?.status).toBe("completed");
        await gotoOrderDetail(buyerPage, memberOrderId);
        await dismissBlockingOverlays(buyerPage);
        await expect(
          buyerPage
            .getByText("已完成")
            .or(buyerPage.locator("#review-modal-title"))
            .first(),
        ).toBeVisible({
          timeout: 15_000,
        });
        await submitFiveStarReview(buyerPage);

        const review = memberOrderId
          ? await getReviewForMemberOrder({
              memberOrderId,
              reviewerId: buyerId,
            })
          : null;

        if (review) {
          expect(review.rating).toBe(5);
          return;
        }

        await expect(
          buyerPage.getByText(/評價已提交|雙方評價已公開/),
        ).toBeVisible({ timeout: 20_000 });
      });
    } finally {
      await buyerContext.close();
      await sellerContext.close();
    }
  });
});
