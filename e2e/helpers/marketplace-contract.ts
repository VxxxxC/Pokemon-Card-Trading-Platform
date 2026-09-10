import { expect, type Page } from "@playwright/test";

/** SSOT: app/marketplace/MarketplacePageClient.tsx */
export function marketplaceSearchInput(page: Page) {
  return page.getByPlaceholder(/搜尋卡牌名稱、編號/);
}

/** SSOT: app/marketplace/[id]/MerchantStorefrontPageClient.tsx */
export function storefrontSearchInput(page: Page) {
  return page.getByPlaceholder(/搜尋此商戶櫥窗內卡牌/);
}

/** SSOT: app/profile/merchant/(dashboard)/trading/MerchantTradingClient.tsx */
export function merchantTradingSearchInput(page: Page) {
  return page.getByPlaceholder(/輸入卡牌名稱、卡號、交易對手姓名或訂單ID/);
}

/** Stable marker on merchant product detail once listing payload is loaded. */
export const MERCHANT_PRODUCT_DETAIL_MARKER = "出讓批次";

export async function expectMerchantProductDetailLoaded(
  page: Page,
): Promise<string> {
  const title = page.locator("main h1");
  await expect(title).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(MERCHANT_PRODUCT_DETAIL_MARKER)).toBeVisible({
    timeout: 15_000,
  });
  return (await title.textContent())?.trim() ?? "";
}

export function publicProfileRatingLink(page: Page) {
  return page
    .locator("section")
    .filter({
      has: page.getByRole("heading", { name: "最近收到的信用評價" }),
    })
    .getByRole("link", { name: "查看更多 →" });
}

export function productDetailGalleryThumb(page: Page, index = 1) {
  return page.getByRole("button", { name: new RegExp(`查看實物特寫角度 ${index}`) }).first();
}

export function productDetailPublicMarketLink(page: Page) {
  return page.getByRole("link", { name: /查看此卡牌的所有掛單/ });
}

export function productDetailGuestBuyLink(page: Page) {
  return page.getByRole("link", { name: "登入 / 註冊以出價或購買" });
}

export function productDetailBuyNowButton(page: Page) {
  return page.getByRole("button", { name: /立即購買/ });
}

export async function expectProductDetailBuyerFooter(page: Page): Promise<void> {
  await expect
    .poll(
      async () => {
        if ((await productDetailGuestBuyLink(page).count()) > 0) {
          return false;
        }
        return page
          .locator("#exe-negotiation-price")
          .isVisible()
          .catch(() => false);
      },
      { timeout: 25_000 },
    )
    .toBe(true);
  await expect(productDetailBuyNowButton(page)).toBeVisible();
}

export async function expectProductDetailContentIntegrity(page: Page): Promise<void> {
  await expect(page.getByText("官方卡號")).toBeVisible();
  await expect(page.getByText(MERCHANT_PRODUCT_DETAIL_MARKER)).toBeVisible();
  await expect(page.getByText("加購平台鑑定託管")).toBeVisible();
  const galleryThumbs = page.getByRole("button", {
    name: /查看實物特寫角度/,
  });
  expect(await galleryThumbs.count()).toBeGreaterThan(0);
}

export async function expectProductDetailSpecOrPending(page: Page): Promise<void> {
  const specTable = page.getByRole("heading", { name: "規格" });
  const ssotPending = page.getByText("SSOT Alignment Pending");
  await expect(specTable.or(ssotPending)).toBeVisible();
}
