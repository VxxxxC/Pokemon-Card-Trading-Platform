// @partner-id P-E08
// @features F-M-16, F-M-17, F-M-19, F-S-08
// @path Partner — TC-E08 C2C auth escrow

import { test, expect } from "@playwright/test";
import {
  getProfileIdByEmail,
  resolveE2eMarketplaceFixture,
} from "../../fixtures/supabase-admin";
import { getChatRealtimeFixtures } from "../../fixtures/chat-test-data";
import { hasMemberTradingFixtures } from "../../fixtures/test-data";
import { ensureMemberPersona } from "../../helpers/collection-asset";
import {
  gotoCheckout,
  gotoOrderDetail,
  gotoTradingPageWithFilter,
  waitForTradingListSettled,
} from "../../helpers/member-trading";
import { assertAuthEscrowCheckoutBreakdownOnPage } from "../../helpers/checkout-display-contract";
import { hasMerchantOrderE2eEnv } from "../../helpers/merchant-orders";
import { dismissBlockingOverlays } from "../../helpers/overlays";
import { seedMemberAuthPendingOrderForE2e } from "../../helpers/platform-rewards";

test.use({ viewport: { width: 1280, height: 900 } });
test.setTimeout(180_000);

test.describe("P-E08 C2C auth escrow", () => {
  test("buyer sees auth escrow payment UI, not P2P handover", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "buyer", "Buyer-only C2C auth escrow");
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

    await ensureMemberPersona(page);
    await gotoOrderDetail(page, orderId);
    await dismissBlockingOverlays(page);

    await expect(page.getByText("交易狀態")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("button", { name: "前往付款" })).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByText(/尚未完成託管付款/)).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByRole("button", { name: "確認完成交易" })).toHaveCount(
      0,
    );
    await expect(page.getByText("待面交")).toHaveCount(0);
    await expect(
      page.getByRole("link", { name: "返回交易管理" }),
    ).toBeVisible();
  });

  test("pending C2C auth checkout breakdown shows SF leg shipping fees", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "buyer", "Buyer-only C2C auth checkout");
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

    await ensureMemberPersona(page);
    await gotoCheckout(page, orderId);
    await dismissBlockingOverlays(page);

    await assertAuthEscrowCheckoutBreakdownOnPage(page);
  });

  test("buyer trading list shows auth escrow 待付款 row", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "buyer", "Buyer-only trading list");
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

    await seedMemberAuthPendingOrderForE2e({
      listingId: fixtureResult.fixture.listingId,
      buyerId,
    });

    await ensureMemberPersona(page);
    await gotoTradingPageWithFilter(page, "待處理");
    await waitForTradingListSettled(page);

    await expect(page.getByText("待付款").first()).toBeVisible({
      timeout: 30_000,
    });
    await expect(
      page.getByRole("button", { name: "前往付款" }).first(),
    ).toBeVisible({ timeout: 15_000 });
  });
});
