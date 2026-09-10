import { test, expect, type Page, type ConsoleMessage } from "@playwright/test";
import path from "node:path";
import fs from "node:fs";
import { hasAdminAuthFixtures, loginAsAdmin, gotoAdminPage } from "./helpers/admin-auth";

const SCREENSHOT_DIR = path.join(process.cwd(), "test-results", "admin-settings-screenshots");

test.beforeAll(() => {
  if (!fs.existsSync(SCREENSHOT_DIR)) {
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  }
});

test.describe("Phase 3 Admin Settings Acceptance", () => {
  test.use({ viewport: { width: 1440, height: 900 } });
  test.setTimeout(120_000);

  test("Route 2: /admin/settings Full Acceptance Test Flow", async ({ page }) => {
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

    // Navigate to /admin/settings
    await gotoAdminPage(page, "/admin/settings");
    
    // 1. 無 console error、無 hydration warning
    expect(consoleErrors, `Console errors found: ${consoleErrors.join("\n")}`).toHaveLength(0);
    expect(hydrationWarnings, `Hydration warnings found: ${hydrationWarnings.join("\n")}`).toHaveLength(0);

    // --- H. Tab Switcher 移除 ---
    // 1. 頁面上唔再有「核心財務與參數」/「防線與風險閾值」/「審計軌跡」三個 tab 按鈕
    const tabButtons = page.locator('button[role="tab"]');
    await expect(tabButtons.filter({ hasText: "核心財務與參數" })).toHaveCount(0);
    await expect(tabButtons.filter({ hasText: "防線與風險閾值" })).toHaveCount(0);
    await expect(tabButtons.filter({ hasText: "審計軌跡" })).toHaveCount(0);

    // 2. 頁面上完全搵唔到「審計軌跡」四個字
    const auditText = page.getByText("審計軌跡");
    await expect(auditText).toHaveCount(0);

    // 3. 搵唔到審計相關 UI
    await expect(page.getByText("日誌編號")).toHaveCount(0);
    await expect(page.getByText("快照 Diff")).toHaveCount(0);
    await expect(page.getByText("CSV 導出")).toHaveCount(0);
    await expect(page.locator("text=/跳至.*頁/")).toHaveCount(0);

    // --- I. 合併後 container 順序（由上而下）---
    const c1Heading = page.locator("#financials-heading");
    const c2Heading = page.locator("#terms-heading");
    const c3Heading = page.locator("#auth-settings-heading");
    const c4Heading = page.locator("#session-ctrl-heading");

    await expect(c1Heading).toBeVisible();
    await expect(c2Heading).toBeVisible();
    await expect(c3Heading).toBeVisible();
    await expect(c4Heading).toBeVisible();

    const top1 = (await c1Heading.evaluate((el) => el.getBoundingClientRect().top));
    const top2 = (await c2Heading.evaluate((el) => el.getBoundingClientRect().top));
    const top3 = (await c3Heading.evaluate((el) => el.getBoundingClientRect().top));
    const top4 = (await c4Heading.evaluate((el) => el.getBoundingClientRect().top));

    console.log(`[Container Vertical Tops] C1: ${top1}, C2: ${top2}, C3: ${top3}, C4: ${top4}`);

    // 「安全設定」(C3) 必須喺「Session Control」(C4) 上面
    expect(top1).toBeLessThan(top2);
    expect(top2).toBeLessThan(top3);
    expect(top3).toBeLessThan(top4);

    // --- J. 安全設定驗證 ---
    const emailInput = page.locator("#admin-email");
    const updateEmailBtn = page.locator("button", { hasText: "更新電郵" });

    // 電郵：留空 → 提交 → error toast「請輸入有效嘅電郵地址」
    await emailInput.fill("");
    await updateEmailBtn.click();
    await expect(page.getByText("請輸入有效嘅電郵地址").first()).toBeVisible();

    // 電郵：輸入 notanemail → error toast
    await emailInput.fill("notanemail");
    await updateEmailBtn.click();
    await expect(page.getByText("請輸入有效嘅電郵地址").first()).toBeVisible();

    // 電郵：輸入 newadmin@hkcv.com → success toast + 欄位清空
    await emailInput.fill("newadmin@hkcv.com");
    await updateEmailBtn.click();
    await expect(page.getByText("管理員電郵已更新，請重新驗證身份。").first()).toBeVisible();
    expect(await emailInput.inputValue()).toBe("");

    // 密碼：兩欄留空 → error toast「請輸入新密碼」
    const newPwdInput = page.locator("#new-password");
    const confirmPwdInput = page.locator("#confirm-password");
    const updatePwdBtn = page.locator("button", { hasText: "更新密碼" });

    await newPwdInput.fill("");
    await confirmPwdInput.fill("");
    await updatePwdBtn.click();
    await expect(page.getByText("請輸入新密碼").first()).toBeVisible();

    // 密碼：輸入 abc123（<8 字元）→ error toast「密碼長度至少 8 個字元」
    await newPwdInput.fill("abc123");
    await confirmPwdInput.fill("abc123");
    await updatePwdBtn.click();
    await expect(page.getByText("密碼長度至少 8 個字元").first()).toBeVisible();

    // 密碼：新密碼 Password123 + 確認 Password456 → error toast「兩次輸入嘅密碼唔一致」
    await newPwdInput.fill("Password123");
    await confirmPwdInput.fill("Password456");
    await updatePwdBtn.click();
    await expect(page.getByText("兩次輸入嘅密碼唔一致").first()).toBeVisible();

    // 密碼：兩欄都 Password123 → success toast + 兩欄清空
    await newPwdInput.fill("Password123");
    await confirmPwdInput.fill("Password123");
    await updatePwdBtn.click();
    await expect(page.getByText("管理員密碼已更新，請重新驗證身份。").first()).toBeVisible();
    expect(await newPwdInput.inputValue()).toBe("");
    expect(await confirmPwdInput.inputValue()).toBe("");

    // Session Control 嘅 LogoutModal 仍然存在可點
    const logoutTriggerBtn = page.locator("button", { hasText: "登出" }).first();
    await expect(logoutTriggerBtn).toBeVisible();

    // Desktop Screenshot
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "desktop-settings.png"), fullPage: true });

    // Console Check
    expect(consoleErrors, `Console errors found: ${consoleErrors.join("\n")}`).toHaveLength(0);
  });

  test("Mobile (390x844 iPhone 14) Visual & Responsiveness Verification", async ({ page }) => {
    test.skip(!hasAdminAuthFixtures(), "Missing E2E_ADMIN_EMAIL or E2E_ADMIN_PASSWORD");
    await page.setViewportSize({ width: 390, height: 844 });
    await loginAsAdmin(page);

    await gotoAdminPage(page, "/admin/settings");
    
    // Mobile Screenshot
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "mobile-settings.png"), fullPage: true });

    // Verify No Horizontal Scroll
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const innerWidth = await page.evaluate(() => window.innerWidth);
    console.log(`[Mobile Settings] scrollWidth: ${scrollWidth}, innerWidth: ${innerWidth}`);
    expect(scrollWidth).toBeLessThanOrEqual(innerWidth);

    // Check Color Scheme: zero blue elements
    const blueElementsCount = await page.evaluate(() => {
      const elements = Array.from(document.querySelectorAll("*"));
      return elements.filter((el) => {
        const style = window.getComputedStyle(el);
        const bg = style.backgroundColor;
        const color = style.color;
        const isBlue = (c: string) => {
          const match = c.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
          if (!match) return false;
          const [, r, g, b] = match.map(Number);
          return b > 180 && b > r + 50 && b > g + 50;
        };
        return isBlue(bg) || isBlue(color);
      }).length;
    });

    console.log(`[Color Check Settings] Strong blue elements count: ${blueElementsCount}`);
    expect(blueElementsCount).toBe(0);
  });
});
