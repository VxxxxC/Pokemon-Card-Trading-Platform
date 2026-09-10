import { test, expect } from "@playwright/test";
import {
  buildPublicProfilePath,
  getMerchantProductDetailFixtures,
  hasPublicProfileFixtures,
} from "./fixtures/test-data";
import { publicProfileRatingLink } from "./helpers/marketplace-contract";
import { dismissBlockingOverlays } from "./helpers/overlays";

test.use({ viewport: { width: 1280, height: 900 } });
test.setTimeout(120_000);

test.describe("Public rating list page", () => {
  test("guest sees rating list with sort controls", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "guest", "Guest-only rating page");
    if (!hasPublicProfileFixtures()) {
      test.skip(true, "Missing E2E_SELLER_ID or E2E_LISTING_ID");
    }

    const { sellerId } = getMerchantProductDetailFixtures();
    await page.goto(`${buildPublicProfilePath(sellerId!)}/rating`, {
      waitUntil: "domcontentloaded",
    });
    await dismissBlockingOverlays(page);

    await expect(page.getByText("全量信用評價歷史")).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByRole("combobox").first()).toBeVisible({
      timeout: 15_000,
    });
  });

  test("buyer can open rating list from public profile", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "buyer", "Buyer-only rating navigation");
    if (!hasPublicProfileFixtures()) {
      test.skip(true, "Missing public profile fixtures");
    }

    const { sellerId } = getMerchantProductDetailFixtures();
    await page.goto(buildPublicProfilePath(sellerId!), {
      waitUntil: "domcontentloaded",
    });
    await dismissBlockingOverlays(page);

    const ratingLink = publicProfileRatingLink(page);
    await expect(ratingLink).toBeVisible({ timeout: 20_000 });
    const ratingHref = await ratingLink.getAttribute("href");
    expect(ratingHref).toMatch(/\/rating/);
    await page.goto(ratingHref!, { waitUntil: "domcontentloaded" });
    await expect(page.getByText("全量信用評價歷史")).toBeVisible({
      timeout: 20_000,
    });
  });
});
