import { test, expect, type Page } from "@playwright/test";
import {
  buildPublicProfilePath,
  getMerchantProductDetailFixtures,
  hasCoreMerchantFixtures,
  hasPublicProfileFixtures,
} from "./fixtures/test-data";
import { getProfilePublicSlug, resolveE2eMarketplaceFixture } from "./fixtures/supabase-admin";
import { dismissBlockingOverlays } from "./helpers/overlays";
import { expectPublicProfileShell } from "./helpers/public-profile-contract";
import {
  expectMerchantProductDetailLoaded,
  publicProfileRatingLink,
} from "./helpers/marketplace-contract";

test.use({ viewport: { width: 1280, height: 900 } });
test.setTimeout(120_000);

let resolvedSellerUsername: string | null = null;

test.beforeAll(async () => {
  if (!hasPublicProfileFixtures()) {
    return;
  }
  const result = await resolveE2eMarketplaceFixture();
  if (!result.ok) {
    return;
  }
  resolvedSellerUsername =
    getMerchantProductDetailFixtures().sellerUsername ??
    (await getProfilePublicSlug(result.fixture.sellerId));
});

test.describe("Public profile page", () => {
  test("guest sees seller profile by UUID", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "guest", "Guest-only public profile smoke");
    if (!hasPublicProfileFixtures()) {
      test.skip(true, "Missing E2E_SELLER_ID or E2E_LISTING_ID");
    }

    const { sellerId } = getMerchantProductDetailFixtures();
    await page.goto(buildPublicProfilePath(sellerId!), {
      waitUntil: "domcontentloaded",
    });
    await dismissBlockingOverlays(page);

    await expectPublicProfileShell(page);
    await expect(page.locator("main h1").first()).toBeVisible();
  });

  test("guest resolves seller profile by username", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "guest", "Guest-only username route");
    if (!resolvedSellerUsername) {
      test.skip(true, "Could not resolve seller username for profile route");
    }

    await page.goto(buildPublicProfilePath(resolvedSellerUsername!), {
      waitUntil: "domcontentloaded",
    });
    await dismissBlockingOverlays(page);
    await expectPublicProfileShell(page);
    await expect(page.locator("main").getByText(/^@/)).toBeVisible({
      timeout: 20_000,
    });
  });

  test("guest sees not-found for unknown profile key", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "guest", "Guest-only negative route");
    if (!hasCoreMerchantFixtures()) {
      test.skip(true, "Missing E2E_SELLER_ID for invalid profile fixture");
    }

    const { invalidSellerId } = getMerchantProductDetailFixtures();
    await page.goto(buildPublicProfilePath(invalidSellerId!), {
      waitUntil: "domcontentloaded",
    });

    await expect(
      page.getByRole("heading", { name: "找不到此用戶檔案" }),
    ).toBeVisible({ timeout: 15_000 });
    await expect(
      page.getByRole("link", { name: "← 返回交易所大盤" }),
    ).toBeVisible();
  });

  test("guest can open listing card into merchant product detail", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "guest", "Guest-only listing navigation");
    if (!hasPublicProfileFixtures()) {
      test.skip(true, "Missing E2E_SELLER_ID or E2E_LISTING_ID");
    }

    const { sellerId } = getMerchantProductDetailFixtures();
    await page.goto(buildPublicProfilePath(sellerId!), {
      waitUntil: "domcontentloaded",
    });
    await dismissBlockingOverlays(page);
    await expectPublicProfileShell(page);

    const listingsSection = page
      .getByRole("heading", { name: /上架中的商品/ })
      .locator("xpath=ancestor::section[1]");
    const listingLink = listingsSection.locator(
      `a[href^="/marketplace/${sellerId}/product/"]`,
    );

    if ((await listingLink.count()) === 0) {
      await expect(listingsSection.getByText("暫無上架商品")).toBeVisible();
      return;
    }

    const href = await listingLink.first().getAttribute("href");
    expect(href).toMatch(/\/product\//);

    await page.goto(href!, { waitUntil: "domcontentloaded" });
    await dismissBlockingOverlays(page);
    await expect(page).toHaveURL(
      new RegExp(
        `/marketplace/${sellerId!.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/product/`,
      ),
      { timeout: 20_000 },
    );
    await expectMerchantProductDetailLoaded(page);
  });

  test("guest can open full rating list from profile preview", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "guest", "Guest-only rating navigation");
    if (!hasPublicProfileFixtures()) {
      test.skip(true, "Missing E2E_SELLER_ID or E2E_LISTING_ID");
    }

    const { sellerId } = getMerchantProductDetailFixtures();
    await page.goto(buildPublicProfilePath(sellerId!), {
      waitUntil: "domcontentloaded",
    });
    await dismissBlockingOverlays(page);
    await expectPublicProfileShell(page);

    const ratingLink = publicProfileRatingLink(page);
    const href = await ratingLink.getAttribute("href");
    expect(href).toMatch(
      new RegExp(
        `^/profile/${sellerId!.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/rating\\?persona=(member|merchant)$`,
      ),
    );

    await ratingLink.click();
    await expect(page).toHaveURL(/\/profile\/[^/]+\/rating\?persona=(member|merchant)/, {
      timeout: 20_000,
    });
    await expect(
      page.getByRole("heading", { name: "全量信用評價歷史" }),
    ).toBeVisible({ timeout: 15_000 });
  });

  test("buyer sees profile shell without auth redirect", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "buyer", "Buyer-only public profile smoke");
    if (!hasPublicProfileFixtures()) {
      test.skip(true, "Missing E2E_SELLER_ID or E2E_LISTING_ID");
    }

    const { sellerId } = getMerchantProductDetailFixtures();
    await page.goto(buildPublicProfilePath(sellerId!), {
      waitUntil: "domcontentloaded",
    });
    await dismissBlockingOverlays(page);

    await expectPublicProfileShell(page);
    await expect(page).not.toHaveURL(/\/auth/);
  });
});
