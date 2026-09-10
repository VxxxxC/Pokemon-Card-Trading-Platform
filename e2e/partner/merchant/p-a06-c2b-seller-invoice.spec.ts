// @partner-id P-A06
// @features F-C-11, F-C-13
// @path Partner

import { test, expect } from "@playwright/test";
import { hasMemberTradingFixtures } from "../../fixtures/test-data";
import { dismissBlockingOverlays } from "../../helpers/overlays";
import {
  hasMerchantOrderE2eEnv,
  seedMerchantAuthAwaitingBuyerConfirm,
} from "../../helpers/merchant-orders";
import { parseHkdAmount } from "../_helpers";

test.use({ viewport: { width: 1280, height: 900 } });
test.setTimeout(120_000);

test.describe("P-A06 C2B merchant seller 實收", () => {
  test("最終實收總額 matches 預計撥款淨額", async ({ page }, testInfo) => {
    test.skip(
      testInfo.project.name !== "seller",
      "Seller-only merchant invoice",
    );
    test.skip(
      !hasMemberTradingFixtures() || !hasMerchantOrderE2eEnv(),
      "Missing seller auth or Supabase seed env",
    );

    const { orderId } = await seedMerchantAuthAwaitingBuyerConfirm();

    await page.goto(`/profile/merchant/orderDetail/${orderId}`, {
      waitUntil: "domcontentloaded",
    });
    await dismissBlockingOverlays(page);

    const receivedRow = page
      .locator("div")
      .filter({ has: page.getByText("最終實收總額", { exact: true }) })
      .last();
    await expect(receivedRow.getByText("最終實收總額")).toBeVisible({
      timeout: 20_000,
    });
    const received = parseHkdAmount(await receivedRow.innerText());

    const payoutRow = page
      .locator("div")
      .filter({ has: page.getByText("預計撥款淨額", { exact: true }) })
      .last();
    await expect(payoutRow.getByText("預計撥款淨額")).toBeVisible();
    const payout = parseHkdAmount(await payoutRow.innerText());

    expect(received).toBe(payout);
  });
});
