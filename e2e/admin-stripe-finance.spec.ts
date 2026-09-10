import { test, expect, type Page, type ConsoleMessage } from "@playwright/test";
import path from "node:path";
import fs from "node:fs";
import { hasAdminAuthFixtures, loginAsAdmin, gotoAdminPage } from "./helpers/admin-auth";

// Optional: `bun run seed:fps-payout-e2e` seeds a ready payout row for deterministic 銷帳 dialog test.

const SCREENSHOT_DIR = path.join(process.cwd(), "test-results", "admin-stripe-finance-screenshots");

test.beforeAll(() => {
  if (!fs.existsSync(SCREENSHOT_DIR)) {
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  }
});


test.describe("Admin Finance Stripe Phase 1 Acceptance", () => {
  test.use({ viewport: { width: 1440, height: 900 } });
  test.setTimeout(120_000);

  test("Route 1: /admin/dashboard verification", async ({ page }) => {
    test.skip(!hasAdminAuthFixtures(), "Missing E2E_ADMIN_EMAIL or E2E_ADMIN_PASSWORD");
    const consoleErrors: string[] = [];
    const hydrationWarnings: string[] = [];

    page.on("console", (msg: ConsoleMessage) => {
      const text = msg.text();
      if (msg.type() === "error") {
        consoleErrors.push(text);
      }
      if (text.includes("Hydration") || text.includes("did not match") || text.includes("hydration")) {
        hydrationWarnings.push(text);
      }
    });

    await loginAsAdmin(page);
    await gotoAdminPage(page, "/admin/dashboard");

    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, "desktop-dashboard.png"),
      fullPage: true,
    });

    expect(consoleErrors, `Console errors found: ${consoleErrors.join("\n")}`).toHaveLength(0);
    expect(hydrationWarnings, `Hydration warnings found: ${hydrationWarnings.join("\n")}`).toHaveLength(0);

    await expect(page.getByRole("heading", { name: "數據總覽" })).toBeVisible();
    await expect(page.getByText("核心營收與成交指標")).toBeVisible();
    await expect(page.getByText("平台淨營收", { exact: true })).toBeVisible();
    await expect(page.getByText("本月總營收")).toBeVisible();
    await expect(page.getByText("交易量分析")).toBeVisible();
    await expect(page.getByText("stripe可用餘額")).toBeVisible();

    const stripeBalanceText = await page
      .locator("span", { hasText: "stripe可用餘額" })
      .locator("xpath=ancestor::div[1]")
      .locator("p.font-mono")
      .first()
      .innerText();

    expect(stripeBalanceText).toMatch(/HK\$\s*[\d,]+|—/);
    expect(stripeBalanceText).not.toContain("NaN");
    expect(stripeBalanceText).not.toContain("undefined");
  });

  test("Route 2: /admin/payouts verification", async ({ page }) => {
    test.skip(!hasAdminAuthFixtures(), "Missing E2E_ADMIN_EMAIL or E2E_ADMIN_PASSWORD");
    const consoleErrors: string[] = [];
    page.on("console", (msg: ConsoleMessage) => {
      if (msg.type() === "error") {
        consoleErrors.push(msg.text());
      }
    });

    await loginAsAdmin(page);
    await gotoAdminPage(page, "/admin/payouts");
    
    // --- A. Stripe 平台帳戶餘額 container ---
    const pageHeader = page.locator("h1", { hasText: "財務與結算管控台" });
    await expect(pageHeader).toBeVisible();

    const stripeContainer = page.locator("div", { hasText: "Stripe 平台餘額" }).filter({
      has: page.locator("h2", { hasText: "Stripe 平台餘額" }),
    }).first();
    await expect(stripeContainer).toBeVisible();

    // Check balance metrics
    await expect(stripeContainer.getByText("可用", { exact: true })).toBeVisible();
    await expect(stripeContainer.getByText("待結算", { exact: true })).toBeVisible();

    // "重新整理" button click -> toast "已重新整理 Stripe 帳戶餘額"
    const refreshBtn = stripeContainer.getByRole("button", { name: "重新整理" });
    await expect(refreshBtn).toBeVisible();
    const toastMsg = page
      .locator("[data-sonner-toast]")
      .filter({ hasText: "已重新整理 Stripe 帳戶餘額" })
      .first();
    await Promise.all([toastMsg.waitFor({ state: "visible", timeout: 15_000 }), refreshBtn.click()]);
    await expect(toastMsg).toBeVisible();

    // --- B. FPS 批次處理 Tab — live ledger only (no Stripe log) ---
    const fpsTabBtn = page.locator("button", { hasText: "FPS 批次處理" });
    await fpsTabBtn.click();

    const fpsLedgerTable = page.locator("table").first();
    await expect(fpsLedgerTable).toBeVisible();

    const fpsLedgerHeaders = fpsLedgerTable.locator("thead tr th");
    const fpsLedgerHeaderTexts = await fpsLedgerHeaders.allInnerTexts();
    expect(fpsLedgerHeaderTexts).toContain("提現單號");
    expect(fpsLedgerHeaderTexts).toContain("訂單號");
    expect(fpsLedgerHeaderTexts).toContain("用戶名稱");
    expect(fpsLedgerHeaderTexts).toContain("FPS ID");
    expect(fpsLedgerHeaderTexts).toContain("狀態");
    expect(fpsLedgerHeaderTexts).toContain("FPS 參考");

    await expect(
      page.locator("h3", { hasText: "Stripe Log — 平台放款紀錄" }),
    ).toHaveCount(0);

    const fpsLedgerRows = fpsLedgerTable.locator("tbody tr");
    const fpsLedgerRowCount = await fpsLedgerRows.count();
    expect(fpsLedgerRowCount).toBeLessThanOrEqual(10);

    const fpsLedgerPagingText = page
      .locator("div", { hasText: "顯示第" })
      .filter({ hasText: "筆資料" })
      .first();
    if (fpsLedgerRowCount > 0) {
      await expect(fpsLedgerPagingText).toContainText("顯示第 1 -");
      await expect(fpsLedgerPagingText).toContainText("筆資料");
    }

    const completeBtn = page.locator("button", { hasText: "✓ 銷帳" }).first();
    if ((await completeBtn.count()) > 0) {
      await completeBtn.click();
      const referenceInput = page.locator('input[name="adminFpsReference"]');
      await expect(referenceInput).toBeVisible();
      await referenceInput.fill("E2E-FPS-REF-001");
      await page.locator("button", { hasText: "確認銷帳" }).click();
      await expect(page.getByText("手動銷帳成功").first()).toBeVisible({
        timeout: 15000,
      });
    }

    const pendingHint = page.getByText("待賣家補 FPS");
    if ((await pendingHint.count()) > 0) {
      const pendingRow = pendingHint.first().locator("xpath=ancestor::tr");
      await expect(pendingRow.locator("button", { hasText: "✓ 銷帳" })).toHaveCount(
        0,
      );
    }

    // Take screenshot of Desktop Payouts FPS tab
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "desktop-payouts-fps-tab.png"), fullPage: true });

    // --- C. 商戶流水 (Stripe) Tab — main ledger table ---
    const stripeTabBtn = page.locator("button", { hasText: "商戶流水 (Stripe)" });
    await stripeTabBtn.click();

    const merchantTable = page.locator("table").first();
    await expect(merchantTable).toBeVisible();

    const merchantHeaders = merchantTable.locator("thead tr th");
    const merchantHeaderTexts = await merchantHeaders.allInnerTexts();
    expect(merchantHeaderTexts).toContain("Stripe 流水號");
    expect(merchantHeaderTexts).toContain("商戶實收 (Transfer)");
    expect(merchantHeaderTexts).toContain("撥款狀態");
    expect(merchantHeaderTexts).not.toContain("帳戶餘額");

    await expect(
      page.locator("h3", { hasText: "Stripe Log — 商戶交易紀錄" }),
    ).toHaveCount(0);

    const merchantRows = merchantTable.locator("tbody tr");
    const merchantRowCount = await merchantRows.count();
    expect(merchantRowCount).toBeLessThanOrEqual(10);

    const merchantPagingText = page
      .locator("div", { hasText: "顯示第" })
      .filter({ hasText: "筆資料" })
      .first();
    if (merchantRowCount > 0) {
      await expect(merchantPagingText).toContainText("顯示第 1 -");
      await expect(merchantPagingText).toContainText("筆資料");
    }

    const sPrevBtn = page.locator("button", { hasText: "上一頁" }).last();
    if (merchantRowCount > 0) {
      await expect(sPrevBtn).toBeDisabled();
    }

    // Screenshot Desktop Payouts Stripe Tab
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "desktop-payouts-stripe-tab.png"), fullPage: true });

    // --- D. 狀態隔離與極致回歸測試 ---
    // Switch to FPS tab first
    await fpsTabBtn.click();

    // 1. FPS ledger search input is present and accepts text
    const fpsSearchInput = page.locator('input[placeholder*="搜尋單號"]');
    await fpsSearchInput.fill("test-search-token");
    await expect(fpsSearchInput).toHaveValue("test-search-token");
    await page.waitForTimeout(500);

    // 2. Switch to Merchant Flow Tab
    await stripeTabBtn.click();

    // Merchant main table pagination is independent of FPS ledger search
    if (merchantRowCount > 0) {
      await expect(merchantPagingText).toContainText("顯示第 1 -");
    }

    // 3. Switch back to FPS Tab
    await fpsTabBtn.click();

    // Confirm FPS ledger search state (tab switches may remount the filter panel)
    const fpsSearchValue = await fpsSearchInput.inputValue();
    if (fpsSearchValue.length > 0) {
      await expect(fpsSearchInput).toHaveValue("test-search-token");
    }

    // Reset search
    await fpsSearchInput.fill("");

    // Test filter chips on FPS ledger table
    const allChip = page.locator("button", { hasText: "全部 (" });
    await allChip.click();
    const upperFpsPagingText = page
      .locator("div", { hasText: "顯示第" })
      .filter({ hasText: "筆資料" })
      .first();
    if (await upperFpsPagingText.isVisible().catch(() => false)) {
      await expect(upperFpsPagingText).toContainText("筆資料");
    }

    // Reset chip back to "未完成"
    const incompleteChip = page.locator("button", { hasText: "未完成 (" });
    await incompleteChip.click();

    // Checkbox select row (if any ledger rows exist)
    const upperFpsRows = fpsLedgerTable.locator("tbody tr");
    const upperFpsRowCount = await upperFpsRows.count();
    if (upperFpsRowCount > 0) {
      const firstCheckbox = upperFpsRows.first().locator('input[type="checkbox"]');
      await firstCheckbox.check();

      const selectedCountBadge = page.locator("span", { hasText: "已選 1 筆" });
      await expect(selectedCountBadge).toBeVisible();

      const exportSelectedBtn = page.locator("button", { hasText: "導出已選" });
      await expect(exportSelectedBtn).toBeVisible();

      await firstCheckbox.uncheck();
    }

    // Test Merchant Flow table search (live DB rows)
    await stripeTabBtn.click();
    const stripeSearchInput = page.locator('input[placeholder*="搜尋商戶名稱"]');
    const upperStripeRows = merchantTable.locator("tbody tr");
    const initialMerchantRowCount = await upperStripeRows.count();
    if (initialMerchantRowCount > 0) {
      const firstMerchantName = await upperStripeRows
        .first()
        .locator("td")
        .nth(3)
        .innerText();
      const searchToken = firstMerchantName.trim().slice(0, 6);
      await stripeSearchInput.fill(searchToken);
      await page.waitForTimeout(500);
      const filteredCount = await upperStripeRows.count();
      expect(filteredCount).toBeGreaterThan(0);
      await stripeSearchInput.fill("");
    }

    expect(consoleErrors, `Console errors found on payouts: ${consoleErrors.join("\n")}`).toHaveLength(0);
  });

  test("Mobile (390x844 iPhone 14) Visual & Responsiveness Verification", async ({ page }) => {
    test.skip(!hasAdminAuthFixtures(), "Missing E2E_ADMIN_EMAIL or E2E_ADMIN_PASSWORD");
    await page.setViewportSize({ width: 390, height: 844 });
    await loginAsAdmin(page);

    // 1. Mobile Dashboard
    await gotoAdminPage(page, "/admin/dashboard");
        await page.screenshot({ path: path.join(SCREENSHOT_DIR, "mobile-dashboard.png"), fullPage: true });

    const dashboardScrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const dashboardInnerWidth = await page.evaluate(() => window.innerWidth);
    console.log(`[Mobile Dashboard] scrollWidth: ${dashboardScrollWidth}, innerWidth: ${dashboardInnerWidth}`);
    expect(dashboardScrollWidth).toBeLessThanOrEqual(dashboardInnerWidth);

    // 2. Mobile Payouts FPS Tab
    await gotoAdminPage(page, "/admin/payouts");
        await page.screenshot({ path: path.join(SCREENSHOT_DIR, "mobile-payouts-fps-tab.png"), fullPage: true });

    const payoutsScrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const payoutsInnerWidth = await page.evaluate(() => window.innerWidth);
    console.log(`[Mobile Payouts] scrollWidth: ${payoutsScrollWidth}, innerWidth: ${payoutsInnerWidth}`);
    expect(payoutsScrollWidth).toBeLessThanOrEqual(payoutsInnerWidth);

    // 3. Mobile Payouts Stripe Tab
    const stripeTabBtn = page.locator("button", { hasText: "商戶流水 (Stripe)" });
    await stripeTabBtn.click();
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "mobile-payouts-stripe-tab.png"), fullPage: true });

    // Check color scheme: ensure no blue elements
    const blueElementsCount = await page.evaluate(() => {
      const elements = Array.from(document.querySelectorAll("*"));
      return elements.filter((el) => {
        const style = window.getComputedStyle(el);
        const bg = style.backgroundColor;
        const color = style.color;
        // Check for strong blue color in RGB like rgb(0, 0, 255) or rgb(59, 130, 246)
        const isBlue = (c: string) => {
          const match = c.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
          if (!match) return false;
          const [, r, g, b] = match.map(Number);
          return b > 180 && b > r + 50 && b > g + 50;
        };
        return isBlue(bg) || isBlue(color);
      }).length;
    });

    console.log(`[Color Check] Strong blue elements count: ${blueElementsCount}`);
    expect(blueElementsCount).toBe(0);
  });
});
