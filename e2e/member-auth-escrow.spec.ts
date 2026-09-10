import { test, expect } from "@playwright/test";
import { getChatRealtimeFixtures } from "./fixtures/chat-test-data";
import {
  ensureDbChatRoom,
  ensureListingAcceptsAuthentication,
  getLatestMemberOrderForListing,
  getListingAcceptsAuthentication,
  getMemberOrderById,
  getProfileDisplayName,
  getProfileIdByEmail,
  guardAuthMemberOrder,
  resolveE2eMarketplaceFixture,
} from "./fixtures/supabase-admin";
import { hasMemberTradingFixtures } from "./fixtures/test-data";
import {
  acceptOfferAsSeller,
  ensurePendingAuthOffer,
  gotoOrderDetail,
  gotoTradingPageWithFilter,
  offerAmountFromListingPrice,
  offerAmountLabelFromListingPrice,
  payAuthMemberOrder,
  pollMemberOrderIdForOffer,
  resolveAuthMemberOrderIdFromTradingList,
  runDevAuthMockFullFlow,
  tradingOrderRowByNumber,
  waitForTradingListSettled,
} from "./helpers/member-trading";
import { hasStripeReconcileEnv } from "./helpers/stripe-reconcile";

test.describe.configure({ mode: "serial" });
test.use({ viewport: { width: 1280, height: 900 } });
test.setTimeout(300_000);

test.describe("Member auth escrow closure", () => {
  test("auth offer → accept → stripe pay → dev complete", async ({
    browser,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== "member-trading",
      "Dual-browser auth escrow runs on member-trading project",
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

    const authEnabled = await ensureListingAcceptsAuthentication(listingId);
    const acceptsAuth = await getListingAcceptsAuthentication(listingId);
    if (!authEnabled && acceptsAuth === false) {
      test.skip(
        true,
        "E2E listing does not accept platform authentication (enable use_authentication or grant service role)",
      );
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

    let offerId: string | null = null;
    let memberOrderId: string | null = null;

    try {
      await test.step("Step 1 — buyer submits auth offer with authentication ON", async () => {
        const offerState = await ensurePendingAuthOffer({
          buyerPage,
          sellerId,
          listingId,
          roomId,
          buyerId,
          offerAmount,
        });
        offerId = offerState.offerId;
      });

      await test.step("Step 2 — seller accepts auth offer in chat", async () => {
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

      await test.step("Step 3 — member_orders row is auth escrow at payment", async () => {
        memberOrderId = await pollMemberOrderIdForOffer(offerId!);

        const order = await getLatestMemberOrderForListing({
          listingId,
          buyerId,
        });
        if (order) {
          memberOrderId = order.id;
          const guard = guardAuthMemberOrder(order);
          if (!guard.ok) {
            test.skip(true, guard.skipReason);
          }
          if (order.escrow_status) {
            expect(order.escrow_status).toBe("payment");
          }
        }
      });

      await test.step("Step 4 — buyer trading list shows 待付款 and 前往付款", async () => {
        await gotoTradingPageWithFilter(buyerPage, "待處理");
        await waitForTradingListSettled(buyerPage);
        await expect(buyerPage.getByText("待付款").first()).toBeVisible({
          timeout: 30_000,
        });
        await expect(
          buyerPage.getByRole("button", { name: "前往付款" }).first(),
        ).toBeVisible({ timeout: 15_000 });

        if (!memberOrderId) {
          memberOrderId = await resolveAuthMemberOrderIdFromTradingList(buyerPage);
        } else {
          const order = await getMemberOrderById(memberOrderId);
          if (order?.order_number) {
            const authOrderRow = tradingOrderRowByNumber(
              buyerPage,
              order.order_number,
            );
            await expect(authOrderRow.getByText("待付款").first()).toBeVisible({
              timeout: 15_000,
            });
            await expect(
              authOrderRow.getByRole("button", { name: "前往付款" }).first(),
            ).toBeVisible();
          }
        }
      });

      await test.step("Step 5 — buyer pays on unified checkout wizard", async () => {
        if (!memberOrderId) {
          memberOrderId = await resolveAuthMemberOrderIdFromTradingList(buyerPage);
        }
        if (!memberOrderId) {
          throw new Error("Could not resolve auth member order id");
        }

        await payAuthMemberOrder(buyerPage, memberOrderId);
      });

      await test.step("Step 6 — dev mock panel completes auth escrow", async () => {
        if (process.env.PRODUCTION_GATE === "1") {
          test.skip(
            true,
            "Dev mock auth panel is not available in production builds",
          );
        }
        if (!memberOrderId) {
          throw new Error("Missing memberOrderId before dev flow");
        }
        await gotoOrderDetail(buyerPage, memberOrderId);
        const mockButton = buyerPage.getByRole("button", {
          name: /一鍵跑完 Mock 全流程/,
        });
        if (!(await mockButton.isVisible().catch(() => false))) {
          test.skip(true, "Dev mock auth panel is not rendered in this build");
        }

        const completed = await runDevAuthMockFullFlow(buyerPage);
        expect(completed).toBe(true);
      });
    } finally {
      await buyerContext.close();
      await sellerContext.close();
    }
  });
});
