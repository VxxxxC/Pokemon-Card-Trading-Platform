// @partner-id P-A01
// @features F-C-03, F-C-04, F-C-12, F-M-07
// @path Partner (no DB seed for listing auth — use inventory UI)

import { test, expect } from "@playwright/test";
import {
  getLatestActiveListingForSellerProduct,
  resolveE2eMarketplaceFixture,
  setListingStatusInactive,
} from "../../fixtures/supabase-admin";
import {
  hasBunnyStorageFixtures,
  hasCoreMerchantFixtures,
  hasBuyerAuthFixtures,
  buildMerchantProductDetailPath,
} from "../../fixtures/test-data";
import {
  addAssetModalForm,
  ensureMerchantPersona,
  openMerchAddAssetModal,
  searchAndSelectCatalogForFixture,
  selectHobbyRawGrading,
  uploadMerchPhotos,
} from "../../helpers/collection-asset";
import { dismissBlockingOverlays } from "../../helpers/overlays";
import {
  BUYER_AUTH_DISABLED_COPY,
  openBuyNowDialog,
} from "../_helpers";

test.use({ viewport: { width: 1280, height: 900 } });
test.setTimeout(240_000);

test.describe("P-A01 merchant RAW listing auth toggle reaches marketplace", () => {
  test("inventory auth ON → buyer buy-now switch is enabled", async ({
    browser,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== "seller",
      "Seller inventory + buyer marketplace uses seller project",
    );
    test.skip(!hasBuyerAuthFixtures() || !hasCoreMerchantFixtures(), "Missing buyer/seller fixtures");
    test.skip(!hasBunnyStorageFixtures(), "Missing Bunny storage env for listing photos");

    const fixtureResult = await resolveE2eMarketplaceFixture({
      requiredSellerPersona: "merchant",
    });
    if (!fixtureResult.ok) {
      test.skip(true, fixtureResult.skipReason);
      return;
    }
    const fixture = fixtureResult.fixture;

    const sellerContext = await browser.newContext({
      storageState: "e2e/.auth/seller.json",
    });
    const buyerContext = await browser.newContext({
      storageState: "e2e/.auth/buyer.json",
    });
    const sellerPage = await sellerContext.newPage();
    const buyerPage = await buyerContext.newPage();
    let createdListingId: string | null = null;

    try {
      await ensureMerchantPersona(sellerPage);
      await sellerPage.goto("/profile/merchant/inventory", {
        waitUntil: "domcontentloaded",
      });
      await dismissBlockingOverlays(sellerPage);
      await openMerchAddAssetModal(sellerPage);
      await searchAndSelectCatalogForFixture(sellerPage, fixture);
      await selectHobbyRawGrading(sellerPage);

      const authToggle = addAssetModalForm(sellerPage)
        .locator("div")
        .filter({ hasText: "接受買家加購平台鑑定" })
        .getByRole("switch");
      await expect(authToggle).toBeVisible({ timeout: 15_000 });
      if ((await authToggle.getAttribute("aria-checked")) !== "true") {
        await authToggle.click();
      }
      await expect(authToggle).toHaveAttribute("aria-checked", "true");

      await addAssetModalForm(sellerPage)
        .getByPlaceholder("一口價放售金額...")
        .fill("18888");
      await uploadMerchPhotos(sellerPage);
      const publishButton = sellerPage.getByRole("button", {
        name: "🚀 立即發佈商品上架",
      });
      await expect(publishButton).toBeEnabled({ timeout: 15_000 });
      await publishButton.click();
      await expect(
        sellerPage.getByText("商品已成功錄入並直接上架交易所大盤"),
      ).toBeVisible({ timeout: 90_000 });

      createdListingId = await getLatestActiveListingForSellerProduct(
        fixture.sellerId,
        fixture.productId,
      );
      expect(createdListingId).toBeTruthy();

      await buyerPage.goto(
        buildMerchantProductDetailPath(fixture.sellerId, createdListingId!),
        { waitUntil: "domcontentloaded" },
      );
      await dismissBlockingOverlays(buyerPage);
      await openBuyNowDialog(buyerPage);

      const buyNowDialog = buyerPage.getByRole("alertdialog", {
        name: "確認立即購買",
      });
      const buyerAuthSwitch = buyNowDialog.getByRole("switch");
      await expect(buyerAuthSwitch).toBeVisible({ timeout: 15_000 });
      await expect(buyerAuthSwitch).toBeEnabled();
      await expect(buyNowDialog.getByText(BUYER_AUTH_DISABLED_COPY)).toHaveCount(
        0,
      );
    } finally {
      if (createdListingId) {
        await setListingStatusInactive(createdListingId);
      }
      await sellerContext.close();
      await buyerContext.close();
    }
  });
});
