// @partner-id P-F02
// @features F-M-06, F-M-08, F-M-11, F-M-14, F-M-15, F-M-24, F-M-25, F-S-05, F-S-11, F-S-13
// @path Partner

import { test, expect } from "@playwright/test";
import { resolveE2eMarketplaceFixture } from "../../fixtures/supabase-admin";
import {
  buildPublicProfilePath,
  hasBuyerAuthFixtures,
  hasCoreMerchantFixtures,
} from "../../fixtures/test-data";
import { ensureMemberPersona } from "../../helpers/collection-asset";
import { gotoTradingPage } from "../../helpers/member-trading";
import { dismissBlockingOverlays } from "../../helpers/overlays";

test.use({ viewport: { width: 1280, height: 900 } });
test.setTimeout(120_000);

test.describe("P-F02 member discovery, trading, and legal", () => {
  test("marketplace, profile, inventory, trading, announcements, terms", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "buyer", "Buyer-only discovery smoke");
    test.skip(
      !hasBuyerAuthFixtures() || !hasCoreMerchantFixtures(),
      "Missing buyer or listing fixtures",
    );

    const fixtureResult = await resolveE2eMarketplaceFixture();
    if (!fixtureResult.ok) {
      test.skip(true, fixtureResult.skipReason);
      return;
    }
    const { sellerId, productId } = fixtureResult.fixture;

    await ensureMemberPersona(page);
    await page.goto("/marketplace", { waitUntil: "domcontentloaded" });
    await dismissBlockingOverlays(page);
    await expect(page.getByRole("heading", { name: "大盤市場" })).toBeVisible({
      timeout: 20_000,
    });
    await expect(
      page.getByPlaceholder("搜尋官方卡牌名稱、編號..."),
    ).toBeVisible();

    await page.goto(`/marketplace/product/${productId}`, {
      waitUntil: "domcontentloaded",
    });
    await dismissBlockingOverlays(page);
    await expect(page.locator("#live-order-book-panel")).toBeVisible({
      timeout: 20_000,
    });

    await page.goto(buildPublicProfilePath(sellerId), {
      waitUntil: "domcontentloaded",
    });
    await dismissBlockingOverlays(page);
    await expect(page.getByText("總完成交易")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText("上架中的商品")).toBeVisible();

    await page.goto("/profile/user/inventory", {
      waitUntil: "domcontentloaded",
    });
    await dismissBlockingOverlays(page);
    await expect(page.locator("#listings-heading")).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByRole("tab", { name: /上架中/ })).toBeVisible();

    await gotoTradingPage(page);
    await expect(page.getByRole("button", { name: /^待處理/ }).first()).toBeVisible();

    await page.goto("/announcements", { waitUntil: "domcontentloaded" });
    await expect(
      page.getByRole("heading", { name: "📢 平台官方公告與最新活動" }),
    ).toBeVisible({ timeout: 20_000 });

    await page.goto("/terms", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.locator("article")).toBeVisible();
    await expect(page.getByText(/平台不提供退款/)).toBeVisible();

    await page.goto("/privacy", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.locator("article")).toBeVisible();
  });
});
