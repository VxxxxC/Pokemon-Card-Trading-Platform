// @partner-id P-E11
// @features F-M-18, F-M-26
// @path Partner — TC-E11 trading smoke and filters

import { test, expect } from "@playwright/test";
import { hasBuyerAuthFixtures, hasMemberTradingFixtures } from "../../fixtures/test-data";
import { ensureMemberPersona } from "../../helpers/collection-asset";
import { gotoTradingPage } from "../../helpers/member-trading";

test.use({ viewport: { width: 1280, height: 900 } });
test.setTimeout(120_000);

test.describe("P-E11 trading smoke and filter shell", () => {
  test("buyer trading page loads status and persona tabs", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "buyer", "Buyer-only trading smoke");
    test.skip(!hasBuyerAuthFixtures(), "Missing buyer auth fixtures");

    await ensureMemberPersona(page);
    await gotoTradingPage(page);

    await expect(page.locator("#user-trading-heading")).toContainText("交易管理");
    await expect(page.getByRole("button", { name: /^全部/ }).first()).toBeVisible();

    for (const label of ["全部", "待處理", "已完成", "已取消"]) {
      await expect(
        page.getByRole("button", { name: new RegExp(`^${label}`) }).first(),
      ).toBeVisible();
    }

    for (const label of ["買單", "賣單"]) {
      await expect(
        page.getByRole("button", { name: new RegExp(`^${label}`) }).first(),
      ).toBeVisible();
    }

    await expect(page.locator("#user-order-search")).toBeVisible();
  });

  test("seller trading page loads sell-side shell", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "seller", "Seller-only trading smoke");
    test.skip(!hasMemberTradingFixtures(), "Missing seller auth or trading fixtures");

    await gotoTradingPage(page);
    await expect(page.locator("#user-trading-heading")).toContainText("交易管理");
    await expect(page.getByRole("button", { name: /^賣單/ }).first()).toBeVisible();
  });
});
