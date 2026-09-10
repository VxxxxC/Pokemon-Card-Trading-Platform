// @partner-id P-E12
// @features F-M-08, F-M-14, F-M-19
// @path Partner — TC-E12 order detail and public profile

import { test, expect } from "@playwright/test";
import {
  getLatestMemberOrderForListing,
  getProfileIdByEmail,
  getProfileUsername,
  guardP2pMemberOrder,
  resolveE2eMarketplaceFixture,
} from "../../fixtures/supabase-admin";
import {
  buildPublicProfilePath,
  hasBuyerAuthFixtures,
  hasMemberTradingFixtures,
  hasPublicProfileFixtures,
} from "../../fixtures/test-data";
import { ensureMemberPersona } from "../../helpers/collection-asset";
import { gotoOrderDetail } from "../../helpers/member-trading";
import { dismissBlockingOverlays } from "../../helpers/overlays";

test.use({ viewport: { width: 1280, height: 900 } });
test.setTimeout(120_000);

async function expectPublicProfileShell(page: import("@playwright/test").Page) {
  await expect(page.getByText("總完成交易")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("上架中的商品")).toBeVisible();
  await expect(page.getByText("最近收到的信用評價")).toBeVisible();
}

test.describe("P-E12 order detail and profile", () => {
  test("guest sees seller public profile shell", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "guest", "Guest-only public profile");
    test.skip(!hasPublicProfileFixtures(), "Missing E2E_SELLER_ID or E2E_LISTING_ID");

    const fixtureResult = await resolveE2eMarketplaceFixture();
    if (!fixtureResult.ok) {
      test.skip(true, fixtureResult.skipReason);
      return;
    }

    await page.goto(buildPublicProfilePath(fixtureResult.fixture.sellerId), {
      waitUntil: "domcontentloaded",
    });
    await dismissBlockingOverlays(page);
    await expectPublicProfileShell(page);
    await expect(page.locator("main h1").first()).toBeVisible();
  });

  test("guest resolves profile by username", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "guest", "Guest-only username profile");
    test.skip(!hasPublicProfileFixtures(), "Missing public profile fixtures");

    const fixtureResult = await resolveE2eMarketplaceFixture();
    if (!fixtureResult.ok) {
      test.skip(true, fixtureResult.skipReason);
      return;
    }

    const username = await getProfileUsername(fixtureResult.fixture.sellerId);
    if (!username) {
      test.skip(true, "Seller username not available");
      return;
    }

    await page.goto(buildPublicProfilePath(username), {
      waitUntil: "domcontentloaded",
    });
    await dismissBlockingOverlays(page);
    await expectPublicProfileShell(page);
  });

  test("buyer P2P order detail shows handover CTA when fixture order exists", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "buyer", "Buyer-only P2P order detail");
    test.skip(
      !hasBuyerAuthFixtures() || !hasMemberTradingFixtures(),
      "Missing buyer or trading fixtures",
    );

    const fixtureResult = await resolveE2eMarketplaceFixture({
      requiredSellerPersona: "member",
    });
    if (!fixtureResult.ok) {
      test.skip(true, fixtureResult.skipReason);
      return;
    }

    const buyerId = await getProfileIdByEmail(process.env.E2E_BUYER_EMAIL!.trim());
    if (!buyerId) {
      test.skip(true, "Could not resolve buyer profile");
      return;
    }

    const order = await getLatestMemberOrderForListing({
      listingId: fixtureResult.fixture.listingId,
      buyerId,
    });
    if (!order) {
      test.skip(true, "No member order for fixture listing; run P2P flow first");
      return;
    }

    const guard = guardP2pMemberOrder(order);
    if (!guard.ok) {
      test.skip(true, guard.skipReason);
      return;
    }

    await ensureMemberPersona(page);
    await gotoOrderDetail(page, order.id);
    await dismissBlockingOverlays(page);

    await expect(
      page.getByRole("button", { name: "確認完成交易" }),
    ).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText("測試模式 — Stripe 尚未接入")).toHaveCount(0);
    await expect(
      page.getByRole("link", { name: "返回交易管理" }),
    ).toBeVisible();
  });
});
