import { expect, type Page } from "@playwright/test";

/**
 * Public profile route renders `PublicPersonaProfileHeader` (variant public-profile).
 * SSOT: app/components/profile/PublicPersonaProfileHeader.tsx — stat label「完成交易」.
 * Legacy dashboard header `ProfileHeaderWithChat` uses「總完成交易」but is not on /profile/[id].
 */
export async function expectPublicProfileReady(page: Page): Promise<void> {
  await expect(page.getByText("完成交易", { exact: true })).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByText("最近收到的信用評價")).toBeVisible();
}

export async function expectPublicProfileShell(page: Page): Promise<void> {
  await expectPublicProfileReady(page);
  await expect(
    page.getByText(/上架中的商品|公開掛單/),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: /查看櫥窗 →|查看掛單 →/ })).toBeVisible();
  await expect(page.getByRole("link", { name: "查看更多 →" })).toBeVisible();
}
