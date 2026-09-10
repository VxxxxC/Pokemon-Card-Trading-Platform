import { test, expect, type Page } from "@playwright/test";
import {
  getMerchantProductDetailFixtures,
  hasBuyerAuthFixtures,
  hasCoreMerchantFixtures,
  buildMerchantProductDetailPath,
} from "./fixtures/test-data";
import {
  ensureDbChatRoom,
  ensureListingActive,
  getLatestOfferForListing,
  getProfileIdByEmail,
  resetE2eListingTradingFixture,
  resolveE2eMarketplaceFixture,
  type ListingMarketplaceFixture,
} from "./fixtures/supabase-admin";
import { marketplaceSearchInput } from "./helpers/marketplace-contract";
import { dismissBlockingOverlays } from "./helpers/overlays";

// AML: E2E buyer is <14 days old (HK$300 cap) and fixture listing has no market price.
// Use $299 to pass rpc_make_offer guards; raise after fixture buyer ages or listing auth changes.
const OFFER_AMOUNT = "299";

test.describe("Marketplace search + make offer", () => {
  test.describe.configure({ mode: "serial" });

  test.use({ viewport: { width: 1280, height: 900 } });

  test.setTimeout(120_000);

  function escapeRegex(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function formatHkd(amount: number): string {
    return `HK$ ${amount.toLocaleString("en-HK")}`;
  }

  function fixtureGridCardLink(page: Page, fixture: ListingMarketplaceFixture) {
    return page
      .locator(`a[href="/marketplace/product/${fixture.productId}"]`)
      .filter({
        hasText: new RegExp(escapeRegex(formatHkd(fixture.lowestPrice))),
      });
  }

  async function searchFixtureProduct(page: Page, fixture: ListingMarketplaceFixture) {
    const searchInput = marketplaceSearchInput(page);
    await searchInput.fill(fixture.searchKeyword);
    await page.getByRole("heading", { name: "大盤市場" }).click();

    const cardLink = fixtureGridCardLink(page, fixture);
    await expect(cardLink).toHaveCount(1, { timeout: 20_000 });
    await expect(cardLink).toBeVisible({ timeout: 20_000 });
    return cardLink;
  }

  async function resolveFixtureOrSkip(
    testInstance: typeof test,
  ): Promise<ListingMarketplaceFixture | null> {
    if (!hasCoreMerchantFixtures()) {
      testInstance.skip(true, "Missing E2E_SELLER_ID or E2E_LISTING_ID");
      return null;
    }

    const { listingId } = getMerchantProductDetailFixtures();
    const result = await resolveE2eMarketplaceFixture();
    if (!result.ok) {
      testInstance.skip(true, result.skipReason);
      return null;
    }

    return result.fixture;
  }

  test("guest smoke — search, grid price, and public product navigation", async ({
    page,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== "guest",
      "Guest-only marketplace search smoke",
    );

    const fixture = await resolveFixtureOrSkip(test);
    if (!fixture) return;

    await test.step("Search marketplace and verify grid price", async () => {
      await page.goto("/marketplace", { waitUntil: "domcontentloaded" });
      await dismissBlockingOverlays(page);
      await searchFixtureProduct(page, fixture);
    });

    await test.step("Open public product page without triggering buy flow", async () => {
      const productLink = fixtureGridCardLink(page, fixture);
      await productLink.click();

      await expect(page).toHaveURL(
        new RegExp(
          `/marketplace/product/${escapeRegex(fixture.productId)}(?:\\?.*)?$`,
        ),
      );
      await expect(page.locator("#live-order-book-panel")).toBeVisible({
        timeout: 20_000,
      });
      await expect(page.getByRole("button", { name: /立即購買/ })).toHaveCount(
        0,
      );
    });
  });

  test("buyer journey — search → order book → slide-over → makeOffer", async ({
    page,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== "buyer",
      "Buyer-only marketplace offer funnel",
    );

    if (!hasBuyerAuthFixtures()) {
      test.skip(true, "Missing E2E_BUYER_EMAIL or E2E_BUYER_PASSWORD");
    }

    const fixture = await resolveFixtureOrSkip(test);
    if (!fixture) return;

    const { buyerEmail } = getMerchantProductDetailFixtures();
    const buyerId = await getProfileIdByEmail(buyerEmail!);
    if (!buyerId) {
      test.skip(true, `Could not resolve buyer profile for ${buyerEmail}`);
      return;
    }

    const roomId = await ensureDbChatRoom(buyerId, fixture.sellerId);

    await test.step("Step 1 — preflight fixture alignment", async () => {
      expect(fixture.listingId.length).toBeGreaterThan(0);
      expect(fixture.searchKeyword.length).toBeGreaterThan(0);
      expect(fixture.lowestPrice).toBeGreaterThan(0);
      expect(fixture.listingPrice).toBeGreaterThan(0);
      await resetE2eListingTradingFixture({
        listingId: fixture.listingId,
        buyerId,
        sellerId: fixture.sellerId,
      });
      await ensureListingActive(fixture.listingId);
    });

    await test.step("Step 2 — open marketplace", async () => {
      await page.goto("/marketplace", { waitUntil: "domcontentloaded" });
      await dismissBlockingOverlays(page);
      await expect(marketplaceSearchInput(page)).toBeVisible({
        timeout: 15_000,
      });
    });

    await test.step("Step 3 — keyword search triggers filtered grid", async () => {
      await searchFixtureProduct(page, fixture);
    });

    await test.step("Step 4 — grid card shows lowest marketplace price", async () => {
      await expect(fixtureGridCardLink(page, fixture)).toContainText(
        new RegExp(escapeRegex(formatHkd(fixture.lowestPrice))),
      );
    });

    await test.step("Step 5 — navigate via card link to public product page", async () => {
      const cardLink = fixtureGridCardLink(page, fixture);
      const productHref = await cardLink.getAttribute("href");
      expect(productHref).toMatch(
        new RegExp(`/marketplace/product/${escapeRegex(fixture.productId)}`),
      );
      await page.goto(productHref!, { waitUntil: "domcontentloaded" });

      await expect(page).toHaveURL(
        new RegExp(
          `/marketplace/product/${escapeRegex(fixture.productId)}(?:\\?.*)?$`,
        ),
        { timeout: 15_000 },
      );
    });

    await test.step("Step 6 — merchant detail footer exposes executable listing", async () => {
      await ensureListingActive(fixture.listingId);
      await page.goto(
        buildMerchantProductDetailPath(fixture.sellerId, fixture.listingId),
        { waitUntil: "domcontentloaded" },
      );
      await dismissBlockingOverlays(page);
      await expect
        .poll(
          async () =>
            page
              .locator("#exe-negotiation-price")
              .isVisible()
              .catch(() => false),
          { timeout: 30_000 },
        )
        .toBe(true);
    });

    await test.step("Step 7 — embedded footer shows negotiation controls", async () => {
      await expect(page.getByRole("button", { name: /立即購買/ })).toBeVisible({
        timeout: 15_000,
      });
      await expect(page.locator("#exe-negotiation-price")).toBeVisible();
    });

    await test.step("Step 8 — submit offer and assert pending DB row", async () => {
      await page.locator("#exe-negotiation-price").fill(OFFER_AMOUNT);
      await page.getByRole("button", { name: "發送議價" }).click();

      await expect
        .poll(
          async () => {
            const errorToast = page
              .locator('[data-sonner-toast][data-type="error"]')
              .first();
            if (await errorToast.isVisible().catch(() => false)) {
              const message = await errorToast
                .innerText()
                .catch(() => "unknown offer error");
              throw new Error(`Offer submission failed: ${message}`);
            }

            const offer = await getLatestOfferForListing({
              roomId,
              listingId: fixture.listingId,
              buyerId,
            });
            if (offer?.status === "pending") {
              return true;
            }

            const fallbackOffer = await getLatestOfferForListing({
              listingId: fixture.listingId,
              buyerId,
            });
            return fallbackOffer?.status === "pending";
          },
          { timeout: 45_000 },
        )
        .toBe(true);
    });

    await test.step("Step 9 — duplicate pending offer is blocked", async () => {
      await expect(page.getByText("等待賣家回應中")).toBeVisible({
        timeout: 15_000,
      });

      const pendingOffers = await getLatestOfferForListing({
        listingId: fixture.listingId,
        buyerId,
      });
      expect(pendingOffers?.status).toBe("pending");
    });
  });
});
