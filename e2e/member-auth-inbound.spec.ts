import { test, expect } from "@playwright/test";
import { getChatRealtimeFixtures } from "./fixtures/chat-test-data";
import {
  advanceAuthOrderToCustody,
  ensureDbChatRoom,
  ensureListingAcceptsAuthentication,
  getListingAcceptsAuthentication,
  getMemberOrderById,
  getProfileDisplayName,
  getProfileIdByEmail,
  resolveE2eMarketplaceFixture,
  submitInboundTrackingViaAdmin,
} from "./fixtures/supabase-admin";
import { hasMemberTradingFixtures } from "./fixtures/test-data";
import {
  acceptOfferAsSeller,
  ensurePendingAuthOffer,
  gotoOrderDetail,
  offerAmountFromListingPrice,
  offerAmountLabelFromListingPrice,
  payAuthMemberOrder,
  pollMemberOrderIdForOffer,
  submitInboundTrackingAsSeller,
} from "./helpers/member-trading";
import { hasStripeReconcileEnv } from "./helpers/stripe-reconcile";

test.use({ viewport: { width: 1280, height: 900 } });
test.setTimeout(300_000);

test.describe("Member auth escrow inbound", () => {
  test("seller submits inbound tracking after buyer stripe pay", async ({
    browser,
  }, testInfo) => {
    test.setTimeout(420_000);
    test.skip(
      testInfo.project.name !== "member-trading",
      "Auth inbound runs on member-trading project",
    );
    test.skip(!hasStripeReconcileEnv(), "Missing Stripe keys for member auth checkout");
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
    const trackingNo = `SF-E2E-${Date.now().toString().slice(-8)}`;

    const authEnabled = await ensureListingAcceptsAuthentication(listingId);
    const acceptsAuth = await getListingAcceptsAuthentication(listingId);
    if (!authEnabled && acceptsAuth === false) {
      test.skip(true, "E2E listing does not accept platform authentication");
      return;
    }

    const fixtures = getChatRealtimeFixtures();
    const buyerEmail = fixtures.buyerEmail!;
    const buyerId = await getProfileIdByEmail(buyerEmail);
    if (!buyerId) {
      test.skip(true, `Could not resolve buyer profile for ${buyerEmail}`);
      return;
    }

    const roomId = await ensureDbChatRoom(buyerId, sellerId);
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
      const offerState = await ensurePendingAuthOffer({
        buyerPage,
        sellerId,
        listingId,
        roomId,
        buyerId,
        offerAmount,
      });
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

      const memberOrderId = await pollMemberOrderIdForOffer(offerState.offerId);
      await payAuthMemberOrder(buyerPage, memberOrderId);
      await advanceAuthOrderToCustody(memberOrderId);

      try {
        await submitInboundTrackingAsSeller(
          sellerPage,
          memberOrderId,
          sellerId,
          trackingNo,
        );
      } catch {
        await submitInboundTrackingViaAdmin(memberOrderId, trackingNo, "順豐");
      }

      const order = await getMemberOrderById(memberOrderId);
      expect(order?.inbound_tracking_no).toBe(trackingNo);
    } finally {
      await buyerContext.close();
      await sellerContext.close();
    }
  });
});
