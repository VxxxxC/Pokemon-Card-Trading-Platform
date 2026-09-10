// @partner-id P-B07
// @features F-M-19, F-S-06
// @path Partner

import { test, expect } from "@playwright/test";
import {
  getProfileIdByEmail,
  resolveE2eMarketplaceFixture,
} from "../../fixtures/supabase-admin";
import { getChatRealtimeFixtures } from "../../fixtures/chat-test-data";
import { hasMemberTradingFixtures } from "../../fixtures/test-data";
import { ensureMemberPersona } from "../../helpers/collection-asset";
import { gotoOrderDetail } from "../../helpers/member-trading";
import { dismissBlockingOverlays } from "../../helpers/overlays";
import {
  hasMerchantOrderE2eEnv,
  seedMemberAuthHeldForSellerInvoice,
} from "../../helpers/merchant-orders";

test.use({ viewport: { width: 1280, height: 900 } });
test.setTimeout(120_000);

test.describe("P-B07 member order invoice coupon", () => {
  test("auth invoice shows 平台優惠 coupon line", async ({ page }, testInfo) => {
    test.skip(
      testInfo.project.name !== "seller",
      "Seller-only C2C auth invoice coupon line",
    );
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

    await ensureMemberPersona(page);
    await gotoOrderDetail(page, orderId);
    await dismissBlockingOverlays(page);

    await expect(page.getByText("交易資產最終交收電子收據")).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByText("平台優惠 (D)", { exact: true })).toBeVisible();
  });
});
