import { test, expect } from "@playwright/test";
import {
  hasBuyerAuthFixtures,
  hasBunnyStorageFixtures,
  hasCoreMerchantFixtures,
} from "./fixtures/test-data";
import {
  countActiveListingsForSellerProduct,
  countProductWatchlistsForUser,
  countUserCollectionsForUserProduct,
  getBuyerProfileIdFromEnv,
  getLatestActiveListingForSellerProduct,
  resolveE2eMarketplaceFixture,
  setListingStatusInactive,
  deleteUserCollectionsForUserProduct,
  type ListingMarketplaceFixture,
} from "./fixtures/supabase-admin";
import {
  addAssetModalForm,
  dismissBlockingOverlays,
  ensureProductInWishlist,
  expectWishlistProductVisible,
  expectHoldingsProductAttached,
  clickHobbyCollectionSubmit,
  clickMerchListingPublish,
  clickWishlistRowMenu,
  gotoCollectionPage,
  holdingsSection,
  merchListingPriceInput,
  openHobbyAddAssetModal,
  openMerchAddAssetModal,
  searchAndSelectCatalogForFixture,
  selectHobbyRawGrading,
  uploadMerchPhotos,
  wishlistSection,
} from "./helpers/collection-asset";

test.use({ viewport: { width: 1280, height: 900 } });
test.setTimeout(120_000);

async function loadMarketplaceFixture(): Promise<
  ListingMarketplaceFixture | { skipReason: string }
> {
  const fixtureResult = await resolveE2eMarketplaceFixture();
  if (!fixtureResult.ok) {
    return { skipReason: fixtureResult.skipReason };
  }

  return fixtureResult.fixture;
}

function skipUnlessBuyerFixtures(testInfo: { project: { name: string } }): void {
  test.skip(testInfo.project.name !== "buyer", "Buyer-only collection flow");
  if (!hasBuyerAuthFixtures() || !hasCoreMerchantFixtures()) {
    test.skip(true, "Missing buyer auth or core listing fixtures");
  }
}

test.describe("Member collection and wishlist", () => {
  test("buyer can star a product and see it on collection page", async ({
    page,
  }, testInfo) => {
    skipUnlessBuyerFixtures(testInfo);

    const loaded = await loadMarketplaceFixture();
    if ("skipReason" in loaded) {
      test.skip(true, loaded.skipReason);
      return;
    }
    const fixture = loaded;

    await ensureProductInWishlist(page, fixture);
    await gotoCollectionPage(page);

    await expect(page.getByText("追蹤願望清單")).toBeVisible({
      timeout: 20_000,
    });
    await expectWishlistProductVisible(page, fixture.productName);
  });

  test("collection page loads holdings and wishlist sections", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "buyer", "Buyer-only collection smoke");
    if (!hasBuyerAuthFixtures()) {
      test.skip(true, "Missing E2E_BUYER_EMAIL or E2E_BUYER_PASSWORD");
    }

    await gotoCollectionPage(page);

    await expect(page.getByText("追蹤願望清單")).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByRole("button", { name: "收錄新卡" })).toBeVisible();
  });

  test("wishlist sort dropdown is interactive", async ({ page }, testInfo) => {
    skipUnlessBuyerFixtures(testInfo);

    await gotoCollectionPage(page);

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

  test("buyer can remove wishlist item from collection page", async ({
    page,
  }, testInfo) => {
    skipUnlessBuyerFixtures(testInfo);

    const loaded = await loadMarketplaceFixture();
    if ("skipReason" in loaded) {
      test.skip(true, loaded.skipReason);
      return;
    }
    const fixture = loaded;
    const buyerId = await getBuyerProfileIdFromEnv();

    await ensureProductInWishlist(page, fixture);
    await gotoCollectionPage(page);

    await expectWishlistProductVisible(page, fixture.productName);

    await dismissBlockingOverlays(page);

    await clickWishlistRowMenu(page, fixture.productName);
    await page.getByRole("menuitem", { name: "從願望清單移除" }).click();

    await expect(page.getByText("已從願望清單移除")).toBeVisible({
      timeout: 15_000,
    });
    await expect
      .poll(async () =>
        wishlistSection(page)
          .getByRole("link", { name: fixture.productName })
          .count(),
      )
      .toBe(0);

    if (buyerId) {
      const remaining = await countProductWatchlistsForUser(
        buyerId,
        fixture.productId,
      );
      if (remaining > 0) {
        await expect
          .poll(async () =>
            countProductWatchlistsForUser(buyerId, fixture.productId),
          )
          .toBe(0);
      }
    }
  });

  test("buyer can add hobby card from collection page", async ({
    page,
  }, testInfo) => {
    skipUnlessBuyerFixtures(testInfo);

    const loaded = await loadMarketplaceFixture();
    if ("skipReason" in loaded) {
      test.skip(true, loaded.skipReason);
      return;
    }
    const fixture = loaded;

    const buyerId = await getBuyerProfileIdFromEnv();
    if (buyerId) {
      await deleteUserCollectionsForUserProduct(buyerId, fixture.productId);
    }

    await gotoCollectionPage(page);
    await expect(page.locator("#cards-heading")).toBeVisible({
      timeout: 20_000,
    });
    await openHobbyAddAssetModal(page);
    await searchAndSelectCatalogForFixture(page, fixture);
    await selectHobbyRawGrading(page);
    await addAssetModalForm(page).getByPlaceholder("0").fill("12345");
    await clickHobbyCollectionSubmit(page);

    await expect(
      page.getByText("已成功收錄進您的私藏愛好清單"),
    ).toBeVisible({ timeout: 20_000 });

    await expectHoldingsProductAttached(page, fixture.productName);

    if (buyerId) {
      await deleteUserCollectionsForUserProduct(buyerId, fixture.productId);
    }
  });
});

test.describe.serial("Member merch listing via AddAssetModal", () => {
  test("merch listing skip collection prompt keeps orphan listing", async ({
    page,
  }, testInfo) => {
    skipUnlessBuyerFixtures(testInfo);
    if (!hasBunnyStorageFixtures()) {
      test.skip(true, "Missing Bunny storage env for merch listing upload");
    }

    const loaded = await loadMarketplaceFixture();
    if ("skipReason" in loaded) {
      test.skip(true, loaded.skipReason);
      return;
    }
    const fixture = loaded;

    const buyerId = await getBuyerProfileIdFromEnv();
    if (!buyerId) {
      test.skip(true, "Unable to resolve buyer profile id");
      return;
    }

    const collectionCountBefore = await countUserCollectionsForUserProduct(
      buyerId,
      fixture.productId,
    );
    const activeListingsBefore = await countActiveListingsForSellerProduct(
      buyerId,
      fixture.productId,
    );

    await gotoCollectionPage(page);
    await expect(page.locator("#cards-heading")).toBeVisible({
      timeout: 20_000,
    });
    const holdingsRowsBefore = await holdingsSection(page)
      .locator("tbody tr")
      .count();
    await openMerchAddAssetModal(page);
    await searchAndSelectCatalogForFixture(page, fixture);
    await merchListingPriceInput(page).fill("19999");
    await uploadMerchPhotos(page);
    const publishButton = addAssetModalForm(page).getByRole("button", {
      name: /立即發佈商品上架/,
    });
    await expect(publishButton).toBeEnabled({ timeout: 15_000 });
    await clickMerchListingPublish(page);

    await expect(
      page.getByText("商品已成功錄入並直接上架交易所大盤"),
    ).toBeVisible({ timeout: 90_000 });
    await expect(page.getByText("是否一併加入收藏庫？")).toBeVisible({
      timeout: 15_000,
    });
    await page.getByRole("button", { name: "略過" }).click();

    await gotoCollectionPage(page);
    const collectionCountAfter = await countUserCollectionsForUserProduct(
      buyerId,
      fixture.productId,
    );
    const holdingsRowsAfter = await holdingsSection(page)
      .locator("tbody tr")
      .count();
    if (collectionCountBefore > 0 || collectionCountAfter > 0) {
      expect(collectionCountAfter).toBe(collectionCountBefore);
    } else {
      expect(holdingsRowsAfter).toBe(holdingsRowsBefore);
    }

    await expect
      .poll(async () =>
        countActiveListingsForSellerProduct(buyerId, fixture.productId),
      )
      .toBeGreaterThan(activeListingsBefore);

    const listingIdCreated = await getLatestActiveListingForSellerProduct(
      buyerId,
      fixture.productId,
    );
    if (listingIdCreated) {
      await setListingStatusInactive(listingIdCreated);
    }
  });

  test("merch listing accept collection prompt adds holdings row", async ({
    page,
  }, testInfo) => {
    skipUnlessBuyerFixtures(testInfo);
    if (!hasBunnyStorageFixtures()) {
      test.skip(true, "Missing Bunny storage env for merch listing upload");
    }

    const loaded = await loadMarketplaceFixture();
    if ("skipReason" in loaded) {
      test.skip(true, loaded.skipReason);
      return;
    }
    const fixture = loaded;

    const buyerId = await getBuyerProfileIdFromEnv();
    if (!buyerId) {
      test.skip(true, "Unable to resolve buyer profile id");
      return;
    }

    await deleteUserCollectionsForUserProduct(buyerId, fixture.productId);

    await gotoCollectionPage(page);
    await openMerchAddAssetModal(page);
    await searchAndSelectCatalogForFixture(page, fixture);
    await merchListingPriceInput(page).fill("18888");
    await uploadMerchPhotos(page);
    const publishButton = addAssetModalForm(page).getByRole("button", {
      name: /立即發佈商品上架/,
    });
    await expect(publishButton).toBeEnabled({ timeout: 15_000 });
    await clickMerchListingPublish(page);

    await expect(
      page.getByText("商品已成功錄入並直接上架交易所大盤"),
    ).toBeVisible({ timeout: 90_000 });
    await expect(page.getByText("是否一併加入收藏庫？")).toBeVisible({
      timeout: 15_000,
    });

    await page.getByLabel("入手價 (HKD)").fill("8888");
    await page.getByRole("button", { name: "加入收藏庫" }).click();

    await expect(page.getByText("已加入收藏庫")).toBeVisible({
      timeout: 20_000,
    });

    await gotoCollectionPage(page);
    await expectHoldingsProductAttached(page, fixture.productName);

    const listingIdCreated = await getLatestActiveListingForSellerProduct(
      buyerId,
      fixture.productId,
    );

    await deleteUserCollectionsForUserProduct(buyerId, fixture.productId);
    if (listingIdCreated) {
      await setListingStatusInactive(listingIdCreated);
    }
  });
});
