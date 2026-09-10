import path from "node:path";
import { expect, type Page } from "@playwright/test";
import { ACTIVE_LISTING_PERSONA_STORAGE_KEY } from "@/lib/listings/active-listing-persona";
import {
  countActiveListingsForSellerProduct,
  clearListingsForSellerProduct,
  getBuyerProfileIdFromEnv,
  seedProductWatchlistForUser,
  acknowledgePendingRewardGrantsForUser,
  type ListingMarketplaceFixture,
} from "../fixtures/supabase-admin";
import {
  dismissBlockingOverlays,
  dismissRewardUnlockedModal,
  waitUntilNoBlockingOverlay,
} from "./overlays";
import { marketplaceSearchInput } from "./marketplace-contract";

export { dismissBlockingOverlays };

export const LISTING_PHOTO_FIXTURE = path.resolve(
  __dirname,
  "../fixtures/listing-photo.png",
);

export async function ensureMemberPersona(page: Page): Promise<void> {
  await page.addInitScript((storageKey) => {
    window.sessionStorage.setItem(storageKey, "member");
    document.cookie = "hkcv_active_listing_persona=member; Path=/; SameSite=Lax";
  }, ACTIVE_LISTING_PERSONA_STORAGE_KEY);
}

export async function ensureMerchantPersona(page: Page): Promise<void> {
  await page.addInitScript((storageKey) => {
    window.sessionStorage.setItem(storageKey, "merchant");
    document.cookie =
      "hkcv_active_listing_persona=merchant; Path=/; SameSite=Lax";
  }, ACTIVE_LISTING_PERSONA_STORAGE_KEY);
}

export async function dismissAddAssetModal(page: Page): Promise<void> {
  const dialog = page.locator('[aria-labelledby="add-asset-modal-title"]');
  for (let attempt = 0; attempt < 6; attempt += 1) {
    if (!(await dialog.isVisible().catch(() => false))) {
      return;
    }
    await page.keyboard.press("Escape").catch(() => undefined);
    await dialog
      .getByRole("button", { name: "Close" })
      .click({ force: true, timeout: 2_000 })
      .catch(() => undefined);
    await page.waitForTimeout(250);
  }
}

export async function gotoCollectionPage(page: Page): Promise<void> {
  await ensureMemberPersona(page);
  const buyerId = await getBuyerProfileIdFromEnv();
  if (buyerId) {
    await acknowledgePendingRewardGrantsForUser(buyerId);
  }
  await page.goto("/profile/user/collection", { waitUntil: "domcontentloaded" });
  await dismissBlockingOverlays(page);
  await dismissRewardUnlockedModal(page);
  await dismissAddAssetModal(page);
  await waitUntilNoBlockingOverlay(page);
}

export function addAssetModalForm(page: Page) {
  return page.locator("form").filter({
    has: page.getByPlaceholder(/卡號或名稱|盒組名稱或條碼/),
  });
}

export async function openMerchAddAssetModal(page: Page): Promise<void> {
  await dismissBlockingOverlays(page);
  await dismissAddAssetModal(page);
  await page.keyboard.press("Escape");
  const addButton = page.getByRole("button", { name: "新增商品" });
  await addButton.scrollIntoViewIfNeeded();
  await addButton.click();
  await expect(addAssetModalForm(page)).toBeVisible({ timeout: 15_000 });
}

export async function openHobbyAddAssetModal(page: Page): Promise<void> {
  await dismissBlockingOverlays(page);
  await dismissAddAssetModal(page);
  await page.keyboard.press("Escape");
  const addButton = page.getByRole("button", { name: "收錄新卡" });
  await expect(addButton).toBeVisible({ timeout: 10_000 });
  await addButton.scrollIntoViewIfNeeded();
  await addButton.click();

  const modal = addAssetModalForm(page);
  if (await modal.isVisible().catch(() => false)) {
    await ensureHobbyCardItemType(page);
    return;
  }

  await addButton.click();
  await expect(modal).toBeVisible({ timeout: 15_000 });
  await ensureHobbyCardItemType(page);
}

export async function ensureHobbyCardItemType(page: Page): Promise<void> {
  const modal = addAssetModalForm(page);
  const cardTab = modal.getByRole("button", { name: "單卡交易 (CARD)" });
  if (!(await cardTab.isVisible().catch(() => false))) {
    return;
  }
  await cardTab.click();
}

export async function waitForAddAssetCatalogSelected(
  page: Page,
  productName: string,
): Promise<void> {
  const modal = addAssetModalForm(page);
  await expect(modal.getByText(productName, { exact: false }).first()).toBeVisible({
    timeout: 20_000,
  });
}

export async function searchAndSelectCatalog(
  page: Page,
  keywords: string | string[],
  preferredMatch?: string,
): Promise<void> {
  const modal = addAssetModalForm(page);
  const searchInput = modal.getByPlaceholder(/卡號或名稱|盒組名稱或條碼/);
  const keywordList = Array.isArray(keywords) ? keywords : [keywords];
  const catalogDropdown = modal.locator("div.absolute.z-50");
  const catalogResults = catalogDropdown.locator("button:has(img)");
  const searchButton = modal.getByRole("button", { name: "搜尋" });

  for (const keyword of keywordList) {
    const normalizedKeyword = keyword.trim();
    if (!normalizedKeyword) {
      continue;
    }

    for (let attempt = 0; attempt < 3; attempt++) {
      await searchInput.fill("");
      await searchInput.fill(normalizedKeyword);
      await expect(searchInput).toHaveValue(normalizedKeyword);
      await searchButton.click();

      const searching = modal.getByText("搜尋中…");
      if (await searching.isVisible().catch(() => false)) {
        await searching.waitFor({ state: "hidden", timeout: 30_000 });
      }

      const hasResults = await catalogResults
        .first()
        .isVisible({ timeout: 20_000 })
        .catch(() => false);
      if (!hasResults) {
        if (attempt < 2) {
          await page.waitForTimeout(1_000);
          continue;
        }
        await expect(catalogResults.first()).toBeVisible({ timeout: 25_000 });
      }

      const matchText = preferredMatch ?? normalizedKeyword;
      const preferred = catalogResults.filter({ hasText: matchText });
      const target =
        (await preferred.count()) > 0 ? preferred.first() : catalogResults.first();

      await target.click();
      await expect(catalogResults).toHaveCount(0, { timeout: 10_000 });
      return;
    }
  }

  throw new Error(
    `AddAssetModal catalog search returned no results for: ${keywordList.join(", ")}`,
  );
}

export async function searchAndSelectCatalogForFixture(
  page: Page,
  fixture: ListingMarketplaceFixture,
): Promise<void> {
  await searchAndSelectCatalog(
    page,
    [
      fixture.catalogModalKeyword,
      fixture.searchKeyword,
      fixture.productName,
      fixture.productId,
    ],
    fixture.catalogModalKeyword,
  );
}

export async function uploadMerchPhotos(
  page: Page,
  photoPath: string = LISTING_PHOTO_FIXTURE,
  count = 6,
): Promise<void> {
  const modal = addAssetModalForm(page);
  const files = Array.from({ length: count }, () => photoPath);
  await modal.locator('input[type="file"]').setInputFiles(files);
  await expect(modal.getByText(`${count}/6`)).toBeVisible({ timeout: 10_000 });
}

export async function ensureProductInWishlist(
  page: Page,
  fixture: ListingMarketplaceFixture,
): Promise<void> {
  const buyerId = await getBuyerProfileIdFromEnv();
  if (buyerId) {
    await seedProductWatchlistForUser(buyerId, fixture.productId);
    await gotoCollectionPage(page);
    await expectWishlistProductVisible(page, fixture.productName);
    return;
  }

  await ensureMemberPersona(page);
  await page.goto("/marketplace", { waitUntil: "domcontentloaded" });
  await dismissBlockingOverlays(page);

  const searchInput = marketplaceSearchInput(page);
  await searchInput.fill(fixture.searchKeyword);
  await page.getByRole("heading", { name: "大盤市場" }).click();

  const productLink = page
    .locator(`a[href="/marketplace/product/${fixture.productId}"]`)
    .first();
  await expect(productLink).toBeVisible({ timeout: 20_000 });

  const wishlistButton = productLink
    .locator("xpath=ancestor::article[1]")
    .getByRole("button", {
      name: /加入願望清單|從願望清單移除/,
    })
    .first();

  const wishlistLabel = (await wishlistButton.getAttribute("aria-label")) ?? "";
  if (wishlistLabel.includes("加入願望清單")) {
    await wishlistButton.click();
    await expect(wishlistButton).toHaveAttribute("aria-label", "從願望清單移除", {
      timeout: 20_000,
    });
  }
}

export function wishlistSection(page: Page) {
  return page.locator("section").filter({ has: page.locator("#wishlist-heading") });
}

export function collectionHoldingsSearchInput(page: Page) {
  return page.getByPlaceholder(/搜尋卡牌名稱、編號/);
}

export function merchListingPriceInput(page: Page) {
  return addAssetModalForm(page).getByRole("spinbutton", { name: /售價/ });
}

export async function clickHobbyCollectionSubmit(page: Page): Promise<void> {
  await addAssetModalForm(page)
    .getByRole("button", { name: /收錄至私藏愛好/ })
    .click();
}

export async function clickMerchListingPublish(page: Page): Promise<void> {
  await addAssetModalForm(page)
    .getByRole("button", { name: /立即發佈商品上架/ })
    .click();
}

export async function clickWishlistRowMenu(
  page: Page,
  productName: string,
): Promise<void> {
  const trigger = wishlistSection(page)
    .getByLabel(`${productName} 更多操作`)
    .filter({ visible: true })
    .first();
  await trigger.scrollIntoViewIfNeeded();
  await trigger.click();
}

export async function expectWishlistProductVisible(
  page: Page,
  productName: string,
): Promise<void> {
  const section = wishlistSection(page);
  await section.scrollIntoViewIfNeeded();
  const link = section.getByRole("link", { name: productName }).first();
  await expect(link).toBeAttached({ timeout: 20_000 });
  await expect(link).toHaveAttribute("href", /\/marketplace\/product\//);
}

export function holdingsSection(page: Page) {
  return page.locator("section").filter({ has: page.locator("#cards-heading") });
}

export function sellPrefillModalForm(page: Page) {
  return page.locator("form").filter({
    has: page.getByText("卡牌與規格已從收藏庫帶入"),
  });
}

export function holdingsRow(page: Page, productName: string) {
  return holdingsSection(page)
    .locator("tbody tr")
    .filter({ hasText: productName })
    .filter({ visible: true })
    .first();
}

export function holdingsRowByPurchasePrice(
  page: Page,
  productName: string,
  purchasePrice: string | number,
  options?: { gradingLabel?: string },
): ReturnType<typeof holdingsRow> {
  const normalized = String(purchasePrice).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  let row = holdingsSection(page)
    .locator("tbody tr")
    .filter({ hasText: productName });
  if (options?.gradingLabel) {
    row = row.filter({ hasText: options.gradingLabel });
  }
  return row
    .filter({
      has: page.locator("td").nth(2).locator("p").first().getByText(normalized),
    })
    .filter({ visible: true })
    .first();
}

export async function waitForCollectionRefresh(page: Page): Promise<void> {
  const wrapper = holdingsSection(page).locator("xpath=..");
  await expect(wrapper).not.toHaveClass(/pointer-events-none/, {
    timeout: 30_000,
  });
}

export async function filterCollectionHoldingsBySearch(
  page: Page,
  query: string,
): Promise<void> {
  const search = collectionHoldingsSearchInput(page);
  await expect(search).toBeVisible({ timeout: 15_000 });
  await search.fill("");
  if (query) {
    await search.fill(query);
  }
  await waitForCollectionRefresh(page);
}

/** Narrows by catalog name search, then paginates until the unique purchase-price row is visible. */
export async function focusHoldingsRowByPurchasePrice(
  page: Page,
  productName: string,
  purchasePrice: string | number,
  options?: { gradingLabel?: string },
): Promise<ReturnType<typeof holdingsRow>> {
  await filterCollectionHoldingsBySearch(page, productName);

  for (let pageIndex = 0; pageIndex < 10; pageIndex += 1) {
    const row = holdingsRowByPurchasePrice(
      page,
      productName,
      purchasePrice,
      options,
    );
    if (await row.isVisible().catch(() => false)) {
      await row.scrollIntoViewIfNeeded();
      return row;
    }

    const nextButton = holdingsSection(page).getByRole("button", {
      name: "下一頁",
    });
    if (!(await nextButton.isEnabled().catch(() => false))) {
      break;
    }
    await nextButton.click();
    await waitForCollectionRefresh(page);
  }

  const row = holdingsRowByPurchasePrice(
    page,
    productName,
    purchasePrice,
    options,
  );
  await expect(row).toBeVisible({ timeout: 20_000 });
  await row.scrollIntoViewIfNeeded();
  return row;
}

export function holdingsRowOverflowButton(row: ReturnType<typeof holdingsRow>) {
  return row
    .getByRole("button", { name: "⋯" })
    .or(row.getByRole("button", { name: /更多操作/ }))
    .filter({ visible: true })
    .first();
}

export async function expectHoldingsProductAttached(
  page: Page,
  productName: string,
): Promise<void> {
  const section = holdingsSection(page);
  await section.scrollIntoViewIfNeeded();
  const link = section
    .getByRole("link", { name: productName })
    .filter({ visible: true })
    .first();
  await expect(link).toBeAttached({ timeout: 20_000 });
  await expect(link).toHaveAttribute("href", /\/marketplace\/product\//);
}

export async function clickHoldingsRowOverflowItem(
  page: Page,
  row: ReturnType<typeof holdingsRow>,
  menuLabel: string,
): Promise<void> {
  await row.scrollIntoViewIfNeeded();
  await holdingsRowOverflowButton(row).click();
  const menuItem = page.getByRole("menuitem", { name: menuLabel });
  await expect(menuItem).toBeVisible({ timeout: 10_000 });
  await menuItem.click();
}

export async function selectHoldingsRowGrade(
  page: Page,
  productName: string,
  purchasePrice: string | number,
  gradeOptionLabel: string,
  options?: { fromGradingLabel?: string },
): Promise<void> {
  const row = await focusHoldingsRowByPurchasePrice(
    page,
    productName,
    purchasePrice,
    options?.fromGradingLabel
      ? { gradingLabel: options.fromGradingLabel }
      : undefined,
  );
  const trigger = row.getByLabel(`更改 ${productName} 鑑定規格`);
  if (await trigger.isVisible().catch(() => false)) {
    await trigger.scrollIntoViewIfNeeded();
    await trigger.click();
  } else {
    await holdingsRowOverflowButton(row).click();
    await page.getByRole("menuitem", { name: "更改鑑定規格" }).click();
  }

  const menuItem = page.getByRole("menuitem", {
    name: gradeOptionLabel,
    exact: true,
  });
  await expect(menuItem).toBeVisible({ timeout: 10_000 });
  await expect(menuItem).toBeEnabled({ timeout: 5_000 });
  await menuItem.click();

  await expect
    .poll(
      async () => {
        const refreshed = holdingsRowByPurchasePrice(
          page,
          productName,
          purchasePrice,
        );
        const text = await refreshed.textContent();
        return text?.includes(gradeOptionLabel) ?? false;
      },
      { timeout: 30_000 },
    )
    .toBe(true);
  await waitForCollectionRefresh(page);
}

export async function clickCollectionFilter(
  page: Page,
  label: string,
): Promise<void> {
  await holdingsSection(page)
    .getByRole("button", { name: label, exact: true })
    .click();
}

export async function openHoldingsRowMenu(
  page: Page,
  productName: string,
): Promise<void> {
  const row = holdingsRow(page, productName);
  await holdingsRowOverflowButton(row).click();
}

export async function hobbyGradingSelectTrigger(
  page: Page,
): Promise<ReturnType<Page["locator"]>> {
  const modal = addAssetModalForm(page);
  await expect(modal.getByText("鑑定／品相", { exact: true })).toBeVisible({
    timeout: 25_000,
  });
  const trigger = modal.locator('[data-slot="select-trigger"]').first();
  await expect(trigger).toBeVisible({ timeout: 25_000 });
  return trigger;
}

export async function selectHobbyGrading(
  page: Page,
  optionLabel: string,
): Promise<void> {
  await ensureHobbyCardItemType(page);
  const modal = addAssetModalForm(page);
  await page.keyboard.press("Escape");
  const trigger = await hobbyGradingSelectTrigger(page);
  await trigger.scrollIntoViewIfNeeded();
  await trigger.click();
  const list = page.locator('[data-slot="select-content"]').last();
  await expect(list).toBeVisible({ timeout: 10_000 });
  const option = page
    .getByRole("option", { name: optionLabel, exact: true })
    .or(
      list
        .locator('[data-slot="select-item"]')
        .filter({ hasText: optionLabel })
        .first(),
    )
    .first();
  await expect(option).toBeAttached({ timeout: 15_000 });
  await option.evaluate((el) => {
    el.scrollIntoView({ block: "center", inline: "nearest" });
  });
  await expect(option).toBeVisible({ timeout: 10_000 });
  await option.click();
  await expect(addAssetModalForm(page)).toBeVisible({ timeout: 10_000 });
}

export async function selectHobbyRawGrading(page: Page): Promise<void> {
  await selectHobbyGrading(page, "裸卡 A");
}

export async function addHobbyHoldingForFixture(
  page: Page,
  fixture: ListingMarketplaceFixture,
  purchasePrice = "12345",
  options?: { gradingOptionLabel?: string },
): Promise<string> {
  const gradingOptionLabel = options?.gradingOptionLabel ?? "裸卡 A";
  const gradingRowLabel = gradingOptionLabel.startsWith("裸卡")
    ? "RAW"
    : gradingOptionLabel.split(" ")[0] ?? gradingOptionLabel;
  const buyerId = await getBuyerProfileIdFromEnv();
  if (buyerId) {
    await acknowledgePendingRewardGrantsForUser(buyerId);
    await clearListingsForSellerProduct(buyerId, fixture.productId);
    await expect
      .poll(
        async () =>
          countActiveListingsForSellerProduct(buyerId, fixture.productId),
        { timeout: 30_000 },
      )
      .toBe(0);
  }

  await gotoCollectionPage(page);
  await expect(page.locator("#cards-heading")).toBeVisible({
    timeout: 20_000,
  });
  await waitUntilNoBlockingOverlay(page);
  await openHobbyAddAssetModal(page);
  await searchAndSelectCatalogForFixture(page, fixture);
  await waitForAddAssetCatalogSelected(page, fixture.productName);
  await expect(addAssetModalForm(page)).toBeVisible({ timeout: 10_000 });
  await selectHobbyGrading(page, gradingOptionLabel);
  const modal = addAssetModalForm(page);
  await expect(modal).toBeVisible({ timeout: 10_000 });
  await modal.getByPlaceholder("0").first().fill(purchasePrice);
  await modal.evaluate((el) => {
    el.scrollTop = el.scrollHeight;
  });
  const submit = modal.getByRole("button", { name: /收錄至私藏愛好/ });
  await expect(submit).toBeVisible({ timeout: 15_000 });
  await submit.click();
  await expect(
    page.getByText("已成功收錄進您的私藏愛好清單"),
  ).toBeVisible({ timeout: 20_000 });
  await page.reload({ waitUntil: "domcontentloaded" });
  await dismissBlockingOverlays(page);
  await expect(page.locator("#cards-heading")).toBeVisible({
    timeout: 20_000,
  });
  await expect(
    holdingsRowByPurchasePrice(page, fixture.productName, purchasePrice, {
      gradingLabel: gradingRowLabel,
    }).getByText("持有中"),
  ).toBeVisible({
    timeout: 20_000,
  });
  return purchasePrice;
}

export async function uploadSellPrefillPhotos(
  page: Page,
  photoPath: string = LISTING_PHOTO_FIXTURE,
  count = 6,
): Promise<void> {
  const modal = sellPrefillModalForm(page);
  const files = Array.from({ length: count }, () => photoPath);
  await modal.locator('input[type="file"]').setInputFiles(files);
  await expect(modal.getByText(`${count}/6`)).toBeVisible({ timeout: 10_000 });
}
