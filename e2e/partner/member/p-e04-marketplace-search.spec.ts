// @partner-id P-E04
// @features F-M-05, F-M-06, F-M-07
// @path Partner — TC-E04 marketplace search

import { test, expect } from "@playwright/test";
import {
  resolveE2eMarketplaceFixture,
  type ListingMarketplaceFixture,
} from "../../fixtures/supabase-admin";
import {
  hasBuyerAuthFixtures,
  hasCoreMerchantFixtures,
} from "../../fixtures/test-data";
import { dismissBlockingOverlays } from "../../helpers/overlays";

test.use({ viewport: { width: 1280, height: 900 } });
test.setTimeout(120_000);

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function formatHkd(amount: number): string {
  return `HK$ ${amount.toLocaleString("en-HK")}`;
}

function fixtureGridCardLink(
  page: import("@playwright/test").Page,
  fixture: ListingMarketplaceFixture,
) {
  return page
    .locator(`a[href="/marketplace/product/${fixture.productId}"]`)
    .filter({
      hasText: new RegExp(escapeRegex(formatHkd(fixture.lowestPrice))),
    });
}

async function searchFixtureProduct(
  page: import("@playwright/test").Page,
  fixture: ListingMarketplaceFixture,
) {
  const searchInput = page.getByPlaceholder("搜尋官方卡牌名稱、編號...");
  await searchInput.fill(fixture.searchKeyword);
  await page.getByRole("heading", { name: "大盤市場" }).click();

  const cardLink = fixtureGridCardLink(page, fixture);
  await expect(cardLink).toHaveCount(1, { timeout: 20_000 });
  await expect(cardLink).toBeVisible({ timeout: 20_000 });
  return cardLink;
}

async function resolveFixtureOrSkip(): Promise<ListingMarketplaceFixture | null> {
  if (!hasCoreMerchantFixtures()) {
    test.skip(true, "Missing E2E_SELLER_ID or E2E_LISTING_ID");
    return null;
  }

  const result = await resolveE2eMarketplaceFixture();
  if (!result.ok) {
    test.skip(true, result.skipReason);
    return null;
  }

  return result.fixture;
}

test.describe("P-E04 marketplace search", () => {
  test("guest search navigates to public product page", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "guest", "Guest marketplace search");
    const fixture = await resolveFixtureOrSkip();
    if (!fixture) return;

    await page.goto("/marketplace", { waitUntil: "domcontentloaded" });
    await dismissBlockingOverlays(page);
    await searchFixtureProduct(page, fixture);

    const cardLink = fixtureGridCardLink(page, fixture);
    const productHref = await cardLink.getAttribute("href");
    await page.goto(productHref!, { waitUntil: "domcontentloaded" });
    await dismissBlockingOverlays(page);

    await expect(page).toHaveURL(
      new RegExp(
        `/marketplace/product/${escapeRegex(fixture.productId)}(?:\\?.*)?$`,
      ),
    );
    await expect(page.locator("#live-order-book-panel")).toBeVisible({
      timeout: 20_000,
    });
  });

  test("buyer search shows order book panel", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "buyer", "Buyer marketplace search");
    test.skip(!hasBuyerAuthFixtures(), "Missing buyer auth fixtures");
    const fixture = await resolveFixtureOrSkip();
    if (!fixture) return;

    await page.goto("/marketplace", { waitUntil: "domcontentloaded" });
    await dismissBlockingOverlays(page);
    await searchFixtureProduct(page, fixture);

    const cardLink = fixtureGridCardLink(page, fixture);
    const productHref = await cardLink.getAttribute("href");
    expect(productHref).toMatch(
      new RegExp(`/marketplace/product/${escapeRegex(fixture.productId)}`),
    );
    await page.goto(productHref!, { waitUntil: "domcontentloaded" });
    await dismissBlockingOverlays(page);

    await expect(page).toHaveURL(
      new RegExp(
        `/marketplace/product/${escapeRegex(fixture.productId)}(?:\\?.*)?$`,
      ),
      { timeout: 15_000 },
    );
    await expect(page.locator("#live-order-book-panel")).toBeVisible({
      timeout: 20_000,
    });
    const sellerRow = page
      .locator("#live-order-book-panel [role='button']")
      .filter({ hasText: fixture.sellerName })
      .filter({ hasText: formatHkd(fixture.listingPrice) })
      .first();
    await expect(sellerRow).toBeVisible({ timeout: 20_000 });
  });
});
