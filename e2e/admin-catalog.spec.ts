import { test, expect, type Page, type ConsoleMessage } from "@playwright/test";
import path from "node:path";
import fs from "node:fs";
import { hasAdminAuthFixtures, loginAsAdmin, gotoAdminPage } from "./helpers/admin-auth";

const SCREENSHOT_DIR = path.join(process.cwd(), "test-results", "admin-catalog-screenshots");

test.beforeAll(() => {
  if (!fs.existsSync(SCREENSHOT_DIR)) {
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  }
});

test.describe("Phase 3 Admin Catalog Acceptance", () => {
  test.use({ viewport: { width: 1440, height: 900 } });
  test.setTimeout(120_000);

  test("Route 1: /admin/catalog Full Acceptance Test Flow", async ({ page }) => {
    test.setTimeout(90000); // Allow sufficient time for the complete multi-step E2E flow
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

    // Navigate to /admin/catalog
    await gotoAdminPage(page, "/admin/catalog");
    
    // --- A. 基本渲染 ---
    // 1. 無 console error、無 hydration warning
    expect(consoleErrors, `Console errors found: ${consoleErrors.join("\n")}`).toHaveLength(0);
    expect(hydrationWarnings, `Hydration warnings found: ${hydrationWarnings.join("\n")}`).toHaveLength(0);

    // 2. 存在搜尋輸入框
    const searchInput = page.locator('input[placeholder*="搜尋編號、卡名"]');
    await expect(searchInput).toBeVisible();

    // 3. 存在 w-full 金色「手動錄入卡牌」按鈕，位於搜尋框下方
    const manualEntryBtn = page.locator("button", { hasText: "手動錄入卡牌" });
    await expect(manualEntryBtn).toBeVisible();
    expect(await manualEntryBtn.evaluate((el) => el.classList.contains("w-full"))).toBe(true);

    // 4. 存在 Tabs「獨立卡」/「Box/Set」，default 選中「獨立卡」
    const cardTab = page.locator('button[role="tab"]', { hasText: "獨立卡" }).first();
    const boxSetTab = page.locator('button[role="tab"]', { hasText: "Box / Set" }).first();
    await expect(cardTab).toBeVisible();
    await expect(boxSetTab).toBeVisible();
    await expect(cardTab).toHaveAttribute("aria-selected", "true");

    // 5. 搜尋時唔可以出現 dropdown 建議選單
    await searchInput.fill("Pikachu");
    // Verify SmartSearch dropdown container is not visible / suppressDropdown works
    const smartSearchDropdown = page.locator('[data-testid="smart-search-dropdown"]');
    await expect(smartSearchDropdown).not.toBeVisible();
    await searchInput.fill(""); // reset search

    // --- B. Product Grid ---
    // 1. Grid 顯示卡片，class 應為 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4（唔可以係等寬 3 欄）
    const gridContainer = page.locator("div.grid.grid-cols-2.sm\\:grid-cols-3.lg\\:grid-cols-4").first();
    await expect(gridContainer).toBeVisible();

    // 2. 卡片上冇購買按鈕、冇價格、冇出價
    const buyBtns = page.locator("button", { hasText: /購買|購入|出價|出價競投/ });
    await expect(buyBtns).toHaveCount(0);

    const priceTexts = page.locator("text=/HK\\$\\s*\\d+/");
    await expect(priceTexts).toHaveCount(0);

    // 3. 卡片顯示：名稱、{setCode} · {cardNumber}、罕有度
    const cardItems = page.locator("div.grid > div");
    const initialCardCount = await cardItems.count();
    expect(initialCardCount).toBeGreaterThan(0);

    const firstCard = cardItems.first();
    await expect(firstCard).toBeVisible();

    // 4. 切換到「Box/Set」Tab → Grid 內容改變；切 Tab 後分頁 reset 回第 1 頁
    await boxSetTab.click();
        await expect(boxSetTab).toHaveAttribute("aria-selected", "true");

    // Switch back to "獨立卡" Tab
    await cardTab.click();
        await expect(cardTab).toHaveAttribute("aria-selected", "true");

    // --- C. 搜尋即時 re-render ---
    // 輸入關鍵字 → 唔出 dropdown，即時 re-render，有 debounce
    await searchInput.fill("SV");
    await page.waitForTimeout(400); // wait for 300ms debounce
    
    // 清空搜尋 → Grid 回複完整列表
    await searchInput.fill("");
    await page.waitForTimeout(400);
    
    // --- D. Image Viewer ---
    // 點擊第 3 張卡 → viewer 應該顯示第 3 張圖（索引對應正確）
    const currentCards = page.locator("div.grid > div");
    const currentCount = await currentCards.count();
    if (currentCount >= 3) {
      const thirdCardImg = currentCards.nth(2).locator("img").first();
      const expectedImgSrc = await thirdCardImg.getAttribute("src");

      await thirdCardImg.click();

      // ImageViewer should open (z-[900])
      const viewerOverlay = page.locator("div.fixed.inset-0.z-\\[900\\]").first();
      await expect(viewerOverlay).toBeVisible();

      // ImageViewer main image
      if (expectedImgSrc) {
        const viewerImg = viewerOverlay.locator("img").first();
        const activeViewerSrc = await viewerImg.getAttribute("src");

        // CatalogCard image passes through Next.js /_next/image?url=...
        // ImageViewer renders raw unoptimized src
        expect(decodeURIComponent(expectedImgSrc)).toContain(activeViewerSrc!);
      }

      // Close ImageViewer using close button
      const closeViewerBtn = viewerOverlay.locator('button[aria-label="關閉預覽"]');
      await closeViewerBtn.click();
      await expect(viewerOverlay).not.toBeVisible();
    }

    // --- E. 手動錄入全螢幕 Dialog（重點回歸項） ---

    // 關鍵回歸基準線：手動條目「絕對唔可以」擠走任何一筆 DB 資料。
    // pending 區同主 Grid 用同一組 grid class，所以要用「全部卡片 - pending 區卡片」
    // 得出純 DB Grid 數量。基準線階段 pending 區未存在，pendingCount 自然為 0。
    const pendingGridCards = page
      .locator("h3", { hasText: "待寫入資料庫的手動錄入條目" })
      .locator("../..")
      .locator("div.grid > div");

    const readDbGridCount = async () => {
      const all = await page.locator("div.grid > div").count();
      const pending = await pendingGridCards.count();
      return all - pending;
    };

    const paginationTotal = page.locator("text=/共 \\d+ 筆資料/").first();
    const hasPagination = await paginationTotal.isVisible().catch(() => false);

    const preManualDbCount = await readDbGridCount();
    const preManualPaginationText = hasPagination
      ? await paginationTotal.textContent()
      : null;
    expect(preManualDbCount).toBeGreaterThan(0);

    // 點「手動錄入卡牌」→ 開啟 Dialog
    await manualEntryBtn.click();

    const dialogContent = page.locator('[role="dialog"]').first();
    await expect(dialogContent).toBeVisible();

    // Dialog 必須係真正全螢幕：實測 getBoundingClientRect()，寬度應約等於 viewport 寬度 (1440) (遠大於破版的 384px)
    const dialogRect = await dialogContent.evaluate((el) => {
      const rect = el.getBoundingClientRect();
      return { width: rect.width, height: rect.height };
    });
    console.log(`[Desktop Dialog Size] width: ${dialogRect.width}, height: ${dialogRect.height}`);
    expect(dialogRect.width).toBeGreaterThan(1300);

    // Helper panel locators to prevent tabpanel strict mode collisions
    const cardFormPanel = dialogContent.locator('[role="tabpanel"]').filter({ has: page.locator('input[placeholder*="Pikachu PROMO"]') }).first();
    const boxSetFormPanel = dialogContent
      .locator('[role="tabpanel"]')
      .filter({ has: page.locator("label", { hasText: "Category" }) })
      .first();

    // Dialog 內有 Tabs「獨立卡」/「Box/Set」
    const dialogTabs = dialogContent.locator('button[role="tab"]');
    await expect(dialogTabs.filter({ hasText: "獨立卡" })).toBeVisible();
    await expect(dialogTabs.filter({ hasText: "Box / Set" })).toBeVisible();

    // 「獨立卡」Tab：有「英文名稱」「中文名稱」「日文名稱」三個獨立 input；冇 Category dropdown、冇 JAN Code
    const enNameInput = cardFormPanel.locator('input[placeholder*="Pikachu PROMO"]');
    const zhNameInput = cardFormPanel.locator('input[placeholder*="皮卡丘 推廣卡"]');
    const jaNameInput = cardFormPanel.locator('input[placeholder*="ピカチュウ"]');
    await expect(enNameInput).toBeVisible();
    await expect(zhNameInput).toBeVisible();
    await expect(jaNameInput).toBeVisible();

    const categoryInCardTab = cardFormPanel.locator("text=Category");
    const janCodeInCardTab = cardFormPanel.locator("text=JAN Code");
    await expect(categoryInCardTab).not.toBeVisible();
    await expect(janCodeInCardTab).not.toBeVisible();

    // 切換至「Box/Set」Tab
    const dialogBoxSetTab = dialogTabs.filter({ hasText: "Box / Set" });
    await dialogBoxSetTab.click();

    // 「Box/Set」Tab：額外有 Category dropdown；選 JAN 條碼規格後顯示 JAN Code input
    const categoryInBoxSet = boxSetFormPanel.locator("text=Category");
    await expect(categoryInBoxSet).toBeVisible();

    const categoryLabel = boxSetFormPanel.locator("label", { hasText: "Category" });
    const categorySelectTrigger = categoryLabel.locator("..").locator('button[role="combobox"]');
    await categorySelectTrigger.click();

    const selectOptions = page.locator('[role="option"]');
    await selectOptions.first().waitFor({ state: "visible" });
    const optionTexts = await selectOptions.allInnerTexts();
    console.log("[Category Dropdown Options]", optionTexts);
    expect(optionTexts).toEqual([
      "補充包",
      "禮盒組",
      "起始牌組",
      "JAN 條碼規格",
    ]);

    await page.getByRole("option", { name: "JAN 條碼規格" }).click();
    const janCodeInBoxSet = boxSetFormPanel.locator('input[placeholder*="4904140548311"]');
    await expect(janCodeInBoxSet).toBeVisible();

    // --- F. 表單驗證 ---
    // 1. 切回「獨立卡」Tab
    const dialogCardTab = dialogTabs.filter({ hasText: "獨立卡" });
    await dialogCardTab.click();

    const submitBtn = dialogContent.locator("button", { hasText: "送出" });

    // 三個名稱全部留空 + 填其他必填 → 提交 → 出現錯誤「請至少輸入一種語言嘅卡牌名稱」
    const cardNumInput = cardFormPanel.locator('input[placeholder*="promo-102"]');
    const setCodeInput = cardFormPanel.locator('input[placeholder*="SV2a"]');
    const imageUrlInput = cardFormPanel.locator('input[placeholder*="圖片 URL"]');

    await cardNumInput.fill("TEST-001");
    await setCodeInput.fill("SV-TEST");
    await enNameInput.fill("");
    await zhNameInput.fill("");
    await jaNameInput.fill("");
    await imageUrlInput.fill("https://picsum.photos/300/400");

    await submitBtn.click();
    const nameErrorToast = page.getByText("請至少輸入一種語言嘅卡牌名稱").first();
    await expect(nameErrorToast).toBeVisible();

    // 只填英文名 + 罕有度 → 提交成功，Dialog 關閉
    await enNameInput.fill("Test Card EN");
    const rarityTrigger = cardFormPanel
      .locator("label", { hasText: "罕有度" })
      .locator("..")
      .locator('button[role="combobox"]');
    await rarityTrigger.click();
    await page.getByRole("option", { name: "PROMO" }).click();
    await submitBtn.click();

    // --- G. 提交後 pending 區與資料遺失驗證（重點回歸項） ---
    // 驗證 Dialog 關閉
    await expect(dialogContent).not.toBeVisible();

    // 驗證 Toast
    const successToast = page.getByText("已新增手動錄入條目").first();
    await expect(successToast).toBeVisible();

    // 主 Grid 上方出現獨立「待寫入資料庫的手動錄入條目」區塊
    const pendingSection = page.locator("h3", { hasText: "待寫入資料庫的手動錄入條目" }).locator("../..");
    await expect(pendingSection).toBeVisible();

    // 內含剛才新增嗰張卡，右上角有「待審核」badge
    const pendingBadge = pendingSection.locator("span", { hasText: "待審核" }).first();
    await expect(pendingBadge).toBeVisible();

    // 「待審核」badge 應該係金色（brand #d4a574 底，具有 bg-brand）
    expect(await pendingBadge.evaluate((el) => el.classList.contains("bg-brand"))).toBe(true);

    // 關鍵回歸驗證：確認 DB Grid 卡片數量 N 同分頁「共 X 筆」完全沒變。
    // 舊版將手動條目 prepend 落 Grid 再 slice(0, PAGE_SIZE)，
    // 會擠走該頁最後一筆 DB 資料，而下一頁 range 又唔會補回 → 資料永久遺失。
    // 呢兩條斷言就係專門捉呢個 regression。
    await expect(pendingGridCards).toHaveCount(1);

    const postManualDbCount = await readDbGridCount();
    expect(postManualDbCount).toBe(preManualDbCount);

    if (preManualPaginationText !== null) {
      await expect(paginationTotal).toHaveText(preManualPaginationText);
    }

    // --- F2. Box/Set JAN Code 驗證與 Tab 狀態隔離 ---
    // 再次開啟手動錄入 Dialog
    await manualEntryBtn.click();
    await expect(dialogContent).toBeVisible();

    // 切換至「Box/Set」Tab
    await dialogBoxSetTab.click();

    const boxSetJanPanel = dialogContent
      .locator('[role="tabpanel"]')
      .filter({ has: page.locator("label", { hasText: "Category" }) })
      .first();
    const boxSetCategoryTrigger = boxSetJanPanel
      .locator("label", { hasText: "Category" })
      .locator("..")
      .locator('button[role="combobox"]');

    // 選 JAN 條碼規格後填一半：編號、系列、名稱、Image，但 JAN Code 填 `abc123`
    await boxSetCategoryTrigger.click();
    await page.getByRole("option", { name: "JAN 條碼規格" }).click();

    const dialogJanInput = boxSetJanPanel.locator('input[placeholder*="4904140548311"]');
    await dialogJanInput.evaluate((el) => {
      const input = el as HTMLInputElement;
      input.value = "abc123";
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await boxSetJanPanel.locator('input[placeholder*="SV2a"]').fill("SV-BOX");
    await boxSetJanPanel.locator('input[placeholder*="Pikachu PROMO"]').fill("Box Set Test");
    await boxSetJanPanel.locator('input[placeholder*="圖片 URL"]').fill("https://picsum.photos/300/400");

    await submitBtn.click();
    const janErrorToast = page.getByText(/JAN Code 必須為全數字|請填寫所有必填欄位並檢查格式/).first();
    await expect(janErrorToast).toBeVisible();

    // Tab 狀態隔離測試：喺 Box/Set Tab 填一半 (JAN Code 留空/錯誤) → 切去「獨立卡」Tab → 填齊獨立卡欄位 → 提交，唔應該被 Box/Set 嘅 JAN Code 驗證卡住
    await dialogCardTab.click();
    await cardFormPanel.locator('input[placeholder*="promo-102"]').fill("CARD-ISO-001");
    await cardFormPanel.locator('input[placeholder*="SV2a"]').fill("SV-ISO");
    await cardFormPanel.locator('input[placeholder*="Pikachu PROMO"]').fill("Isolated Card Test");
    await cardFormPanel.locator('input[placeholder*="圖片 URL"]').fill("https://picsum.photos/300/400");
    const isolatedRarityTrigger = cardFormPanel
      .locator("label", { hasText: "罕有度" })
      .locator("..")
      .locator('button[role="combobox"]');
    await isolatedRarityTrigger.click();
    await page.getByRole("option", { name: "PROMO" }).click();

    await submitBtn.click();
    // 應該順利提交成功，Dialog 關閉，唔會被 Box/Set 的 JAN Code 攔截
    await expect(dialogContent).not.toBeVisible();
    await expect(page.getByText("已新增手動錄入條目").first()).toBeVisible();

    // Desktop Screenshot
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "desktop-catalog.png"), fullPage: true });

    // Console Check
    expect(consoleErrors, `Console errors found: ${consoleErrors.join("\n")}`).toHaveLength(0);
  });

  test("Mobile (390x844 iPhone 14) Visual & Fullscreen Dialog Verification", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await loginAsAdmin(page);

    await gotoAdminPage(page, "/admin/catalog");
    
    // Open Manual Entry Dialog
    const manualEntryBtn = page.locator("button", { hasText: "手動錄入卡牌" });
    await manualEntryBtn.click();

    const dialogContent = page.locator('[role="dialog"]').first();
    await expect(dialogContent).toBeVisible();

    // Check Dialog Mobile Fullscreen width & height
    const dialogRect = await dialogContent.evaluate((el) => {
      const rect = el.getBoundingClientRect();
      return { width: rect.width, height: rect.height };
    });
    console.log(`[Mobile Dialog Size] width: ${dialogRect.width}, height: ${dialogRect.height}`);
    expect(Math.abs(dialogRect.width - 390)).toBeLessThan(20);

    // Mobile Screenshot with Dialog Open
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "mobile-catalog-dialog-open.png"), fullPage: true });

    // Close Dialog
    const closeBtn = dialogContent.locator('button[aria-label="關閉"]');
    await closeBtn.click();
    await expect(dialogContent).not.toBeVisible();

    // Mobile Screenshot Main Page
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "mobile-catalog.png"), fullPage: true });

    // Verify No Horizontal Scroll
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const innerWidth = await page.evaluate(() => window.innerWidth);
    console.log(`[Mobile Catalog] scrollWidth: ${scrollWidth}, innerWidth: ${innerWidth}`);
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

    console.log(`[Color Check Catalog] Strong blue elements count: ${blueElementsCount}`);
    expect(blueElementsCount).toBe(0);
  });
});
