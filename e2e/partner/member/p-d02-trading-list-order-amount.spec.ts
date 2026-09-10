// @partner-id P-D02
// @features F-M-18, F-M-16
// @path Partner — trading list pending auth row amount

import { test, expect } from "@playwright/test";
import {
  getProfileIdByEmail,
  resolveE2eMarketplaceFixture,
} from "../../fixtures/supabase-admin";
import { getChatRealtimeFixtures } from "../../fixtures/chat-test-data";
import { hasMemberTradingFixtures } from "../../fixtures/test-data";
import { ensureMemberPersona } from "../../helpers/collection-asset";
import {
  gotoTradingPageWithFilter,
  waitForTradingListSettled,
} from "../../helpers/member-trading";
import {
  getMemberOrderFinancialSnapshot,
  getMemberOrderNumber,
  readTradingListAmountForOrderNumber,
} from "../../helpers/order-financial-contract";
import { dismissBlockingOverlays } from "../../helpers/overlays";
import { hasMerchantOrderE2eEnv } from "../../helpers/merchant-orders";
import { seedMemberAuthPendingOrderForE2e } from "../../helpers/platform-rewards";

test.use({ viewport: { width: 1280, height: 900 } });
test.setTimeout(180_000);

test.describe("P-D02 trading list order amount contract", () => {
  test("pending auth row amount matches DB final_price", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "buyer", "Buyer-only trading list amount");
    test.skip(
      !hasMemberTradingFixtures() || !hasMerchantOrderE2eEnv(),
      "Missing buyer auth or Supabase seed env",
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

    const orderId = await seedMemberAuthPendingOrderForE2e({
      listingId: fixtureResult.fixture.listingId,
      buyerId,
    });
    const orderNumber = await getMemberOrderNumber(orderId);
    const snapshot = await getMemberOrderFinancialSnapshot(orderId);

    await ensureMemberPersona(page);
    await gotoTradingPageWithFilter(page, "待處理");
    await waitForTradingListSettled(page);
    await dismissBlockingOverlays(page);

    const listAmount = await readTradingListAmountForOrderNumber(
      page,
      orderNumber,
    );
    expect(listAmount).toBe(snapshot.finalPrice);
  });
});
