import { test, expect, type Page, type ConsoleMessage } from "@playwright/test";
import path from "node:path";
import fs from "node:fs";
import {
  getBuyerProfileIdFromEnv,
  getLatestOpenModerationCaseForSubject,
  insertOpenFraudCaseForE2e,
} from "./fixtures/supabase-admin";
import { getMerchantProductDetailFixtures } from "./fixtures/test-data";
import { hasAdminAuthFixtures, loginAsAdmin, gotoAdminPage } from "./helpers/admin-auth";

const SCREENSHOT_DIR = path.join(process.cwd(), "test-results", "admin-dispute-freeze-screenshots");

async function getOrSeedOpenDisputeCase(): Promise<string> {
  const { sellerId } = getMerchantProductDetailFixtures();
  if (!sellerId) {
    throw new Error("Missing E2E_SELLER_ID");
  }

  const buyerId = await getBuyerProfileIdFromEnv();
  if (!buyerId) {
    throw new Error("Missing E2E_BUYER_EMAIL");
  }

  const existing = await getLatestOpenModerationCaseForSubject(sellerId);
  if (existing) {
    return existing.id;
  }

  return insertOpenFraudCaseForE2e({
    subjectId: sellerId,
    reporterId: buyerId,
    suffix: "FREEZE",
  });
}

test.beforeAll(() => {
  if (!fs.existsSync(SCREENSHOT_DIR)) {
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  }
});

test.describe("Admin Dispute Freeze Account Phase 2 Acceptance", () => {
  test.use({ viewport: { width: 1440, height: 900 } });
  test.setTimeout(120_000);

  test("Route 2: /admin/disputes/[id] dispute freeze flow verification", async ({ page }) => {
    test.skip(!hasAdminAuthFixtures(), "Missing E2E_ADMIN_EMAIL or E2E_ADMIN_PASSWORD");
    test.skip(
      !process.env.SUPABASE_SERVICE_ROLE_KEY?.trim(),
      "Missing SUPABASE_SERVICE_ROLE_KEY for dispute seed",
    );

    const { sellerId } = getMerchantProductDetailFixtures();
    if (!sellerId) {
      test.skip(true, "Missing E2E_SELLER_ID");
      return;
    }

    const buyerId = await getBuyerProfileIdFromEnv();
    if (!buyerId) {
      test.skip(true, "Missing E2E_BUYER_EMAIL");
      return;
    }

    const disputeCaseId = await getOrSeedOpenDisputeCase();
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

    await gotoAdminPage(page, `/admin/disputes/${disputeCaseId}`);
    
    await expect(
      page.getByRole("heading", { name: "仲裁判定動作" }),
    ).toBeVisible({ timeout: 20_000 });

    const statusBadge = page.locator("span", { hasText: "待處理" }).first();
    await expect(statusBadge).toBeVisible();

    const resolutionCombobox = page
      .getByRole("combobox")
      .filter({ hasText: /請選擇一項仲裁判定動作/ });
    await resolutionCombobox.click();

    await expect(page.getByRole("option", { name: "凍結出款" })).toBeVisible();
    await expect(page.getByRole("option", { name: "凍結帳戶 7 日" })).toBeVisible();
    await expect(page.getByText("強制封禁涉事違規帳號")).toHaveCount(0);
    await expect(page.getByText("凍結涉事帳戶 (Freeze Account)")).toHaveCount(0);
    expect(await page.getByRole("option").count()).toBe(8);

    await page.getByRole("option", { name: "駁回舉報" }).click();
    await page.getByRole("button", { name: "執行最終仲裁裁決" }).click();

    await expect(page).toHaveURL(/\/admin\/disputes\?status=completed/, {
      timeout: 20_000,
    });
    await expect(
      page.getByRole("heading", { name: "舉報與爭議仲裁工作台" }),
    ).toBeVisible();

    // Console & Hydration Check
    expect(consoleErrors, `Console errors found: ${consoleErrors.join("\n")}`).toHaveLength(0);
    expect(hydrationWarnings, `Hydration warnings found: ${hydrationWarnings.join("\n")}`).toHaveLength(0);

    // Desktop Screenshot
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "desktop-dispute-freeze.png"), fullPage: true });
  });

  test("Mobile (390x844 iPhone 14) Visual & Responsiveness Verification", async ({ page }) => {
    test.skip(!hasAdminAuthFixtures(), "Missing E2E_ADMIN_EMAIL or E2E_ADMIN_PASSWORD");
    test.skip(
      !process.env.SUPABASE_SERVICE_ROLE_KEY?.trim(),
      "Missing SUPABASE_SERVICE_ROLE_KEY for dispute seed",
    );

    const { sellerId } = getMerchantProductDetailFixtures();
    if (!sellerId) {
      test.skip(true, "Missing E2E_SELLER_ID");
      return;
    }

    const buyerId = await getBuyerProfileIdFromEnv();
    if (!buyerId) {
      test.skip(true, "Missing E2E_BUYER_EMAIL");
      return;
    }

    const disputeCaseId = await getOrSeedOpenDisputeCase();

    await page.setViewportSize({ width: 390, height: 844 });
    await loginAsAdmin(page);

    await gotoAdminPage(page, `/admin/disputes/${disputeCaseId}`);
    
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "mobile-dispute-freeze.png"), fullPage: true });

    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const innerWidth = await page.evaluate(() => window.innerWidth);
    console.log(`[Mobile Dispute Freeze] scrollWidth: ${scrollWidth}, innerWidth: ${innerWidth}`);
    expect(scrollWidth).toBeLessThanOrEqual(innerWidth);

    // Check color scheme: ensure no blue elements
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

    console.log(`[Color Check Dispute Freeze] Strong blue elements count: ${blueElementsCount}`);
    expect(blueElementsCount).toBe(0);
  });
});
