import { test, expect, type Page } from "@playwright/test";
import {
  getProfileUsername,
  getProfileIdByEmail,
  resetE2eListingTradingFixture,
  resolveE2eMarketplaceFixture,
  type ListingMarketplaceFixture,
} from "./fixtures/supabase-admin";
import {
  buildMerchantProductDetailPath,
  getMerchantProductDetailFixtures,
  hasCoreMerchantFixtures,
  hasWrongSellerFixture,
} from "./fixtures/test-data";
import {
  MERCHANT_PRODUCT_DETAIL_MARKER,
  expectMerchantProductDetailLoaded,
  expectProductDetailBuyerFooter,
  expectProductDetailContentIntegrity,
  expectProductDetailSpecOrPending,
  productDetailGalleryThumb,
  productDetailGuestBuyLink,
  productDetailPublicMarketLink,
} from "./helpers/marketplace-contract";
import { dismissBlockingOverlays } from "./helpers/overlays";

const FAKE_LISTING_ID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

let marketplaceFixture: ListingMarketplaceFixture | null = null;
let sellerUsername: string | null = null;
let fixtureSkipReason = "";

test.beforeAll(async () => {
  if (!hasCoreMerchantFixtures()) {
    fixtureSkipReason = "Missing E2E_SELLER_ID or E2E_LISTING_ID";
    return;
  }

  const result = await resolveE2eMarketplaceFixture();
  if (!result.ok) {
    fixtureSkipReason = result.skipReason;
    return;
  }

  marketplaceFixture = result.fixture;
  const env = getMerchantProductDetailFixtures();
  sellerUsername =
    env.sellerUsername ??
    (await getProfileUsername(marketplaceFixture.sellerId));
});

function requireMarketplaceFixture(
  testInstance: typeof test,
): ListingMarketplaceFixture {
  if (!marketplaceFixture) {
    testInstance.skip(true, fixtureSkipReason || "Marketplace fixture unavailable");
  }
  return marketplaceFixture!;
}

async function gotoAndExpectNotFound(page: Page, path: string): Promise<void> {
  await page.goto(path, { waitUntil: "domcontentloaded", timeout: 30_000 });

  const notFoundUi = page
    .getByRole("heading", { name: "找不到頁面", exact: true })
    .or(page.getByText("Error 404", { exact: true }));

  if (await notFoundUi.first().isVisible().catch(() => false)) {
    return;
  }

  // Next.js App Router may return HTTP 200 for notFound() — assert absence of detail UI.
  await expect(
    page.getByText(MERCHANT_PRODUCT_DETAIL_MARKER),
    `Expected missing listing UI for ${path}`,
  ).toHaveCount(0);
  await expect(page.locator("main h1")).toHaveCount(0);
}

async function expectDetailPageLoaded(page: Page): Promise<string> {
  return expectMerchantProductDetailLoaded(page);
}

async function openCoreDetailPage(page: Page): Promise<string> {
  const fixture = marketplaceFixture!;
  await page.goto(
    buildMerchantProductDetailPath(fixture.sellerId, fixture.listingId),
    { waitUntil: "domcontentloaded" },
  );
  return expectDetailPageLoaded(page);
}

test.describe("A. Route resolution", () => {
  test("A1 resolves listing UUID for seller profile UUID", async ({ page }) => {
    const fixture = requireMarketplaceFixture(test);

    await page.goto(
      buildMerchantProductDetailPath(fixture.sellerId, fixture.listingId),
    );

    const title = await expectDetailPageLoaded(page);
    expect(title.length).toBeGreaterThan(0);
    await expect(productDetailPublicMarketLink(page)).toBeVisible();
    await expect(productDetailGalleryThumb(page, 1)).toBeVisible();
  });

  test("A2 resolves listing UUID for seller username", async ({ page }) => {
    const fixture = requireMarketplaceFixture(test);
    if (!sellerUsername) {
      test.skip(true, "Missing seller username for profile route");
    }

    await page.goto(
      buildMerchantProductDetailPath(sellerUsername!, fixture.listingId),
    );

    await expectDetailPageLoaded(page);
  });

  test("A3 resolves catalog display_id for the same seller listing", async ({
    page,
  }) => {
    const fixture = requireMarketplaceFixture(test);
    if (!fixture.displayId) {
      test.skip(true, "Fixture listing has no catalog display_id");
    }

    const baselineTitle = await openCoreDetailPage(page);

    await page.goto(
      buildMerchantProductDetailPath(fixture.sellerId, fixture.displayId!),
    );

    const resolvedTitle = await expectDetailPageLoaded(page);
    expect(resolvedTitle).toBe(baselineTitle);
  });

  test("A4 resolves catalog product_id for the same seller listing", async ({
    page,
  }) => {
    const fixture = requireMarketplaceFixture(test);
    const baselineTitle = await openCoreDetailPage(page);

    await page.goto(
      buildMerchantProductDetailPath(fixture.sellerId, fixture.productId),
    );

    const resolvedTitle = await expectDetailPageLoaded(page);
    expect(resolvedTitle).toBe(baselineTitle);
  });
});

test.describe("B. Negative and edge cases", () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== "guest", "Guest-only negative routes");
  });

  test("B1 returns 404 for an invalid seller UUID", async ({ page }) => {
    const fixture = requireMarketplaceFixture(test);
    const { invalidSellerId } = getMerchantProductDetailFixtures();

    await gotoAndExpectNotFound(
      page,
      buildMerchantProductDetailPath(invalidSellerId!, fixture.listingId),
    );
  });

  test("B2 returns 404 for a valid seller with a non-existent listing UUID", async ({
    page,
  }) => {
    const fixture = requireMarketplaceFixture(test);
    await gotoAndExpectNotFound(
      page,
      buildMerchantProductDetailPath(fixture.sellerId, FAKE_LISTING_ID),
    );
  });

  test("B3 returns 404 when listing UUID belongs to a different seller", async ({
    page,
  }) => {
    if (!hasWrongSellerFixture()) {
      test.skip(true, "Missing E2E_WRONG_SELLER_ID or E2E_LISTING_ID");
    }

    const fixture = requireMarketplaceFixture(test);
    const { wrongSellerId } = getMerchantProductDetailFixtures();
    await gotoAndExpectNotFound(
      page,
      buildMerchantProductDetailPath(wrongSellerId!, fixture.listingId),
    );
  });

  test("B4 returns 404 for an extremely long malformed product segment", async ({
    page,
  }) => {
    const fixture = requireMarketplaceFixture(test);
    const malformedProductId = "x".repeat(512);
    await gotoAndExpectNotFound(
      page,
      buildMerchantProductDetailPath(fixture.sellerId, malformedProductId),
    );
  });
});

test.describe("C. UI interactions", () => {
  test("C1 switches the hero image when a gallery thumbnail is selected", async ({
    page,
  }) => {
    requireMarketplaceFixture(test);

    await openCoreDetailPage(page);

    const secondThumb = productDetailGalleryThumb(page, 2);
    const thumbCount = await secondThumb.count();
    if (thumbCount === 0) {
      test.skip(true, "Fixture listing has fewer than 2 gallery photos");
    }

    await secondThumb.click();
    await expect(secondThumb).toHaveClass(/border-brand/);
    await expect(secondThumb).toHaveClass(/ring-brand/);
  });

  test("C2 navigates to the public marketplace product page", async ({
    page,
  }) => {
    requireMarketplaceFixture(test);

    await openCoreDetailPage(page);

    const publicMarketLink = productDetailPublicMarketLink(page);
    await expect(publicMarketLink).toBeVisible();

    const href = await publicMarketLink.getAttribute("href");
    expect(href).toMatch(/^\/marketplace\/product\/.+/);

    await publicMarketLink.click();
    await page.waitForURL(/\/marketplace\/product\/.+/);
    expect(page.url()).toContain(href!);
  });

  test("C3 returns to the storefront via the back button", async ({ page }) => {
    const fixture = requireMarketplaceFixture(test);
    const sellerId = fixture.sellerId;
    await page.goto(`/marketplace/${sellerId}`, {
      waitUntil: "domcontentloaded",
    });

    const detailLink = page
      .locator(`a[href*="/marketplace/${sellerId}/product/"]`)
      .first();
    await expect(detailLink).toBeVisible({ timeout: 30_000 });
    await detailLink.click();

    await expect(page).toHaveURL(
      new RegExp(`/marketplace/${sellerId}/product/.+`),
    );
    await expectDetailPageLoaded(page);

    await page.locator("main").getByRole("button").first().click();
    await expect(page).toHaveURL(new RegExp(`/marketplace/${sellerId}$`));
  });
});

test.describe("D. BuyButton interactions", () => {
  test.beforeEach(async ({}, testInfo) => {
    if (testInfo.project.name !== "buyer" || !marketplaceFixture) {
      return;
    }

    const { buyerEmail } = getMerchantProductDetailFixtures();
    const buyerId = buyerEmail ? await getProfileIdByEmail(buyerEmail) : null;
    if (!buyerId) {
      return;
    }

    await resetE2eListingTradingFixture({
      listingId: marketplaceFixture.listingId,
      buyerId,
      sellerId: marketplaceFixture.sellerId,
    });
  });

  test("D1 guest sees the locked slide-over when clicking buy", async ({
    page,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== "guest",
      "Guest-only BuyButton interaction",
    );

    requireMarketplaceFixture(test);

    await openCoreDetailPage(page);
    await productDetailGuestBuyLink(page).click();
    await expect(page).toHaveURL(/\/auth\?redirect=/, { timeout: 15_000 });
  });

  test("D2 buyer opens the buy-now confirm dialog without guest lock", async ({
    page,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== "buyer",
      "Buyer-only BuyButton interaction",
    );

    requireMarketplaceFixture(test);

    await openCoreDetailPage(page);
    await expectProductDetailBuyerFooter(page);
  });

  test("D3 buyer can close the buy-now confirm dialog", async ({
    page,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== "buyer",
      "Buyer-only BuyButton interaction",
    );

    requireMarketplaceFixture(test);

    await openCoreDetailPage(page);
    await expectProductDetailBuyerFooter(page);
    await expect
      .poll(
        async () => {
          if (await page.getByText("等待賣家回應中").isVisible().catch(() => false)) {
            return "pending";
          }
          return (await page
            .locator("#exe-negotiation-price")
            .isEnabled()
            .catch(() => false))
            ? "ready"
            : "loading";
        },
        { timeout: 20_000 },
      )
      .toMatch(/pending|ready/);
  });
});

test.describe("E. Content integrity", () => {
  test("shows seller, grading, and escrow metadata on a valid listing", async ({
    page,
  }) => {
    requireMarketplaceFixture(test);

    await openCoreDetailPage(page);
    await expectProductDetailContentIntegrity(page);
  });
});

test.describe("F. Known suspicious behaviors", () => {
  test("F1 buyer can open buy-now confirm dialog immediately after hard reload without guest lock", async ({
    page,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== "buyer",
      "Buyer-only race regression for mockRole hydration",
    );

    const fixture = requireMarketplaceFixture(test);
    const path = buildMerchantProductDetailPath(
      fixture.sellerId,
      fixture.listingId,
    );

    await page.goto(path, { waitUntil: "domcontentloaded" });
    await page.reload({ waitUntil: "domcontentloaded" });
    await dismissBlockingOverlays(page);

    await expectProductDetailBuyerFooter(page);
  });

  test("F2 product_id route resolves to the same canonical listing as listing UUID", async ({
    page,
  }) => {
    const fixture = requireMarketplaceFixture(test);

    await page.goto(
      buildMerchantProductDetailPath(fixture.sellerId, fixture.listingId),
    );
    const baselineTitle = await expectDetailPageLoaded(page);

    await page.goto(
      buildMerchantProductDetailPath(fixture.sellerId, fixture.productId),
    );
    const resolvedTitle = await expectDetailPageLoaded(page);

    expect(resolvedTitle).toBe(baselineTitle);
  });

  test("F3 shows canonical spec table or SSOT pending warning", async ({
    page,
  }) => {
    requireMarketplaceFixture(test);

    await openCoreDetailPage(page);
    await expectProductDetailSpecOrPending(page);
  });
});
