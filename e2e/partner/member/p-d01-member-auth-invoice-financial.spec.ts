// @partner-id P-D01
// @features F-M-16, F-M-17, F-S-06
// @path Partner — member auth order detail invoice financial rows

import { test } from "@playwright/test";
import {
  getProfileIdByEmail,
  resolveE2eMarketplaceFixture,
} from "../../fixtures/supabase-admin";
import { getChatRealtimeFixtures } from "../../fixtures/chat-test-data";
import { hasMemberTradingFixtures } from "../../fixtures/test-data";
import { ensureMemberPersona } from "../../helpers/collection-asset";
import { gotoOrderDetail } from "../../helpers/member-trading";
import {
  assertMemberAuthInvoiceMatchesSnapshot,
  finalizeMemberAuthInvoiceFinancialSeed,
} from "../../helpers/order-financial-contract";
import { dismissBlockingOverlays } from "../../helpers/overlays";
import {
  hasMerchantOrderE2eEnv,
  seedMemberAuthHeldForSellerInvoice,
} from "../../helpers/merchant-orders";

test.use({ viewport: { width: 1280, height: 900 } });
test.setTimeout(120_000);

test.describe("P-D01 member auth invoice financial contract", () => {
  test("seller invoice financial rows match DB snapshot", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "seller", "Seller-only invoice financial");
    test.skip(
      !hasMemberTradingFixtures() || !hasMerchantOrderE2eEnv(),
      "Missing seller auth or Supabase seed env",
    );

    const fixtureResult = await resolveE2eMarketplaceFixture({
      requiredSellerPersona: "member",
    });
    if (!fixtureResult.ok) {
      test.skip(true, fixtureResult.skipReason);
      return;
    }

    const buyerEmail = getChatRealtimeFixtures().buyerEmail;
    const buyerId = buyerEmail ? await getProfileIdByEmail(buyerEmail) : null;
    if (!buyerId) {
      test.skip(true, "Could not resolve buyer profile");
      return;
    }

    const { orderId } = await seedMemberAuthHeldForSellerInvoice({
      listingId: fixtureResult.fixture.listingId,
      buyerId,
    });
    const snapshot = await finalizeMemberAuthInvoiceFinancialSeed(orderId);

    await ensureMemberPersona(page);
    await gotoOrderDetail(page, orderId);
    await dismissBlockingOverlays(page);

    await assertMemberAuthInvoiceMatchesSnapshot(page, snapshot, "seller");
  });
});
