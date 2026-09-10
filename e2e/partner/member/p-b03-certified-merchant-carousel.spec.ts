// @partner-id P-B03
// @features F-M-04
// @path Partner

import { test, expect } from "@playwright/test";
import { hasCoreMerchantFixtures } from "../../fixtures/test-data";
import {
  dismissBlockingOverlays,
  suppressTransientHomeOverlays,
  waitUntilNoBlockingOverlay,
} from "../../helpers/overlays";

test.use({ viewport: { width: 1280, height: 900 } });
test.setTimeout(90_000);

test.describe("P-B03 certified merchant carousel profile", () => {
  test("carousel CTA opens merchant public profile, not member username", async ({
    page,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== "buyer",
      "Buyer-only certified merchant carousel",
    );
    test.skip(!hasCoreMerchantFixtures(), "Missing merchant listing fixtures");

    await suppressTransientHomeOverlays(page);
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await waitUntilNoBlockingOverlay(page);
    await dismissBlockingOverlays(page);

    const section = page.locator("#premium-heading");
    await expect(section).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText("暫無認證商家現貨上架")).toHaveCount(0);

    const enterShop = page.getByRole("link", { name: /進入 / }).first();
    await expect(enterShop).toBeVisible({ timeout: 20_000 });
    await waitUntilNoBlockingOverlay(page);
    await enterShop.click({ force: true });

    await expect(page).toHaveURL(/\/profile\/[0-9a-f-]{36}\/?$/i, {
      timeout: 15_000,
    });
    await expect(page.getByText("認證商戶").first()).toBeVisible({
      timeout: 15_000,
    });
  });
});
