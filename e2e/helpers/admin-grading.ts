import { expect, type Locator, type Page } from "@playwright/test";
import { dismissBlockingOverlays } from "./overlays";

const GRADING_SEARCH_PLACEHOLDER = "搜尋訂單、買家、物流…";

export async function openAdminGradingTab(
  page: Page,
  tabLabel: string,
): Promise<void> {
  await page.getByRole("button", { name: tabLabel }).click();
  await expect(page.getByRole("button", { name: "搜尋" })).toBeEnabled({
    timeout: 30_000,
  });
}

export async function filterAdminGradingOrderKind(
  page: Page,
  kind: "member" | "merchant",
): Promise<void> {
  const kindSelect = page.locator("select").filter({
    has: page.locator(`option[value="${kind}"]`),
  });
  await kindSelect.selectOption(kind);
  await expect(page.getByRole("button", { name: "搜尋" })).toBeEnabled({
    timeout: 30_000,
  });
}

export async function searchAdminGradingQueue(
  page: Page,
  keyword: string,
): Promise<void> {
  const searchInput = page.getByPlaceholder(GRADING_SEARCH_PLACEHOLDER);
  await searchInput.fill(keyword);
  await expect(searchInput).toHaveValue(keyword);
  await page.getByRole("button", { name: "搜尋" }).click();
  await expect(page.getByRole("button", { name: "搜尋" })).toBeEnabled({
    timeout: 30_000,
  });
}

export function adminGradingOrderRow(page: Page, orderNumber: string) {
  return page.locator("tr", { hasText: orderNumber }).first();
}

export async function waitForAdminGradingOrderRow(
  page: Page,
  orderNumber: string,
  options?: { timeoutMs?: number },
): Promise<Locator> {
  const timeoutMs = options?.timeoutMs ?? 90_000;
  const row = adminGradingOrderRow(page, orderNumber);
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    await openAdminGradingTab(page, "待出庫");
    await filterAdminGradingOrderKind(page, "member");
    await searchAdminGradingQueue(page, orderNumber);
    if (await row.isVisible().catch(() => false)) {
      return row;
    }

    await page.reload({ waitUntil: "domcontentloaded" });
    await dismissBlockingOverlays(page);
    await expect(page.getByRole("heading", { name: "鑑定工作台" })).toBeVisible({
      timeout: 30_000,
    });
  }

  await expect(row).toBeVisible({ timeout: 10_000 });
  return row;
}
