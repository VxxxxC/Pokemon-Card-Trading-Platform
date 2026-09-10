// @partner-id P-E07
// @features F-M-10, F-M-11
// @path Partner — TC-E07 collection and wishlist

import { test, expect } from "@playwright/test";
import {
  hasBuyerAuthFixtures,
  hasCoreMerchantFixtures,
} from "../../fixtures/test-data";
import {
  gotoCollectionPage,
  dismissBlockingOverlays,
} from "../../helpers/collection-asset";

test.use({ viewport: { width: 1280, height: 900 } });
test.setTimeout(120_000);

test.describe("P-E07 member collection", () => {
  test("collection page sections and wishlist filters load", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "buyer", "Buyer collection journey");
    test.skip(
      !hasBuyerAuthFixtures() || !hasCoreMerchantFixtures(),
      "Missing buyer or listing fixtures",
    );

    await gotoCollectionPage(page);
    await dismissBlockingOverlays(page);

    await expect(page.getByText("追蹤願望清單")).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByRole("button", { name: "收錄新卡" })).toBeVisible();
    await expect(page.locator("#cards-heading")).toBeVisible({
      timeout: 20_000,
    });

    const sortTrigger = page.getByRole("combobox", { name: "願望清單排序" });
    await expect(sortTrigger).toBeVisible();
    await expect(sortTrigger).toContainText("按卡名排序");
    await sortTrigger.click();
    await page.getByRole("option", { name: "最新加入" }).click();
    await expect(sortTrigger).toContainText("最新加入");
    await expect(page.getByText("追蹤願望清單")).toBeVisible({
      timeout: 20_000,
    });
  });
});
