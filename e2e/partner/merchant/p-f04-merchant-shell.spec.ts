// @partner-id P-F04
// @features F-C-01, F-C-04, F-C-05, F-C-06, F-C-07, F-C-08, F-C-09, F-M-26
// @path Partner

import { test, expect } from "@playwright/test";
import { hasMemberTradingFixtures } from "../../fixtures/test-data";
import {
  ensureMemberPersona,
  ensureMerchantPersona,
} from "../../helpers/collection-asset";
import { gotoTradingPage } from "../../helpers/member-trading";
import { dismissBlockingOverlays } from "../../helpers/overlays";

test.use({ viewport: { width: 1280, height: 900 } });
test.setTimeout(120_000);

test.describe("P-F04 merchant ops and member-seller trading", () => {
  test("merchant dashboard, inventory, settings, finance, performance", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "seller", "Seller-only merchant shell");
    test.skip(!hasMemberTradingFixtures(), "Missing seller auth");

    await ensureMerchantPersona(page);
    await page.goto("/profile/merchant", { waitUntil: "domcontentloaded" });
    await dismissBlockingOverlays(page);
    await expect(
      page.getByRole("heading", { name: "待處理訂單" }),
    ).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/KYC 已驗證|審核中/)).toBeVisible();

    await page.goto("/profile/merchant/inventory", {
      waitUntil: "domcontentloaded",
    });
    await dismissBlockingOverlays(page);
    await expect(page.locator("#listings-heading")).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByRole("tab", { name: /上架中/ })).toBeVisible();

    await page.goto("/profile/merchant/settings", {
      waitUntil: "domcontentloaded",
    });
    await expect(
      page.getByRole("heading", { name: "店舖安全與設定中心" }),
    ).toBeVisible({ timeout: 20_000 });

    await page.goto("/profile/merchant/finance", {
      waitUntil: "domcontentloaded",
    });
    await expect(page.getByText("本月撥款收入（已結算）")).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByRole("heading", { name: /撥款記錄/ })).toBeVisible();
    await expect(
      page.getByRole("searchbox", { name: "訂單編號 / Transfer ID" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "套用篩選" }),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: "全部" })).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Stripe Connect 帳戶" }),
    ).toBeVisible();

    await page.goto("/profile/merchant/performance", {
      waitUntil: "domcontentloaded",
    });
    await expect(page.getByText("歷史累計總營業額")).toBeVisible({
      timeout: 20_000,
    });
  });

  test("member-persona trading as seller", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "seller", "Seller-only member trading");
    test.skip(!hasMemberTradingFixtures(), "Missing seller auth");

    await ensureMemberPersona(page);
    await gotoTradingPage(page);
    await expect(page.getByRole("button", { name: /^待處理/ }).first()).toBeVisible();
  });
});
