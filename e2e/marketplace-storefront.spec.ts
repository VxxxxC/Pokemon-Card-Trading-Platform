import { test, expect } from "@playwright/test";
import {
  getMerchantProductDetailFixtures,
  hasPublicProfileFixtures,
} from "./fixtures/test-data";
import { storefrontSearchInput } from "./helpers/marketplace-contract";
import { dismissBlockingOverlays } from "./helpers/overlays";

test.use({ viewport: { width: 1280, height: 900 } });
test.setTimeout(120_000);

test.describe("Marketplace seller storefront", () => {
  test("guest sees seller storefront shell and listing grid or empty state", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "guest", "Guest-only storefront");
    if (!hasPublicProfileFixtures()) {
      test.skip(true, "Missing E2E_SELLER_ID or E2E_LISTING_ID");
    }

    const { sellerId } = getMerchantProductDetailFixtures();
    await page.goto(`/marketplace/${sellerId}`, {
      waitUntil: "domcontentloaded",
    });
    await dismissBlockingOverlays(page);

    await expect(storefrontSearchInput(page)).toBeVisible({ timeout: 20_000 });

    const hasGrid = await page
      .locator("a[href*='/marketplace/']")
      .first()
      .isVisible()
      .catch(() => false);
    const hasEmpty = await page
      .getByText("此商戶私域櫥窗暫時沒有符合篩選條件的商品")
      .isVisible()
      .catch(() => false);

    expect(hasGrid || hasEmpty).toBe(true);
  });
});
