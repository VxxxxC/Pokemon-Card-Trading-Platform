// @partner-id P-B04
// @features F-C-02
// @path Partner

import { test, expect } from "@playwright/test";
import { hasMemberTradingFixtures } from "../../fixtures/test-data";
import { ensureMerchantPersona } from "../../helpers/collection-asset";
import {
  hasMerchantOrderE2eEnv,
  seedMerchantPsaPendingOrder,
} from "../../helpers/merchant-orders";
import { dismissBlockingOverlays } from "../../helpers/overlays";

test.use({ viewport: { width: 1280, height: 900 } });
test.setTimeout(120_000);

test.describe("P-B04 merchant trading RAW filter", () => {
  test.skip(true, "RAW/裸卡 filter removed from merchant trading UI");

  test("只顯示 RAW/裸卡 hides graded PSA/BGS/CGC rows", async ({
    page,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== "seller",
      "Seller-only merchant RAW filter",
    );
    test.skip(!hasMemberTradingFixtures(), "Missing seller auth");
    test.skip(!hasMerchantOrderE2eEnv(), "Missing merchant order E2E env");

    await seedMerchantPsaPendingOrder();
    await ensureMerchantPersona(page);
    await page.goto("/profile/merchant/trading", {
      waitUntil: "domcontentloaded",
    });
    await dismissBlockingOverlays(page);

    await expect(
      page.getByRole("heading", { name: /交易管理/ }),
    ).toBeVisible({ timeout: 20_000 });
    const gradedText = page.getByText(/\b(PSA|BGS|CGC|ARS)\s/);
    await expect(gradedText.first()).toBeVisible({ timeout: 20_000 });

    await page.locator("label").filter({ hasText: "只顯示 RAW/裸卡" }).click();
    await expect(gradedText).toHaveCount(0);
  });
});
