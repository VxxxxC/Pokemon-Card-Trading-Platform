// @partner-id P-B09
// @features F-M-05
// @path Partner

import { test, expect } from "@playwright/test";
import {
  getMerchantProductDetailFixtures,
  hasCoreMerchantFixtures,
  hasListingProductIdFixture,
} from "../../fixtures/test-data";
import { dismissBlockingOverlays } from "../../helpers/overlays";

test.use({ viewport: { width: 1280, height: 900 } });
test.setTimeout(90_000);

test.describe("P-B09 marketplace seller name vs badge", () => {
  test("認證商戶 card seller name matches merchant username fixture", async ({
    page,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== "buyer",
      "Buyer-only marketplace seller badge",
    );
    test.skip(
      !hasCoreMerchantFixtures() || !hasListingProductIdFixture(),
      "Missing merchant product fixtures",
    );

    const fixtures = getMerchantProductDetailFixtures();
    const productId = fixtures.listingProductId!;

    await page.goto("/marketplace", { waitUntil: "domcontentloaded" });
    await dismissBlockingOverlays(page);

    const card = page.locator(`a[href="/marketplace/product/${productId}"]`);
    await expect(card.first()).toBeVisible({ timeout: 20_000 });

    const merchantCard = page
      .locator("a[href^='/marketplace/product/']")
      .filter({ hasText: "認證商戶" })
      .first();
    await expect(merchantCard).toBeVisible({ timeout: 20_000 });
    await expect(merchantCard.getByText("賣家")).toBeVisible();
    await expect(merchantCard.locator("p").last()).not.toHaveText(/^\s*$/);
  });
});
