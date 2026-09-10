// @partner-id P-E16
// @features F-M-17, F-C-10
// @path Partner — G-CONF1M merchant auth confirm guard (UI)

import { test, expect } from "@playwright/test";
import { hasMemberTradingFixtures } from "../../fixtures/test-data";
import { ensureMemberPersona } from "../../helpers/collection-asset";
import { dismissBlockingOverlays } from "../../helpers/overlays";
import { gotoOrderDetail } from "../../helpers/member-trading";
import {
  hasMerchantOrderE2eEnv,
  seedMerchantAuthConfirmGuardNegative,
} from "../../helpers/merchant-orders";

test.use({ viewport: { width: 1280, height: 900 } });
test.setTimeout(120_000);

test.describe("P-E16 G-CONF1M merchant auth confirm guard", () => {
  test("buyer cannot confirm B2C auth receipt before payment fully captured", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "buyer", "Buyer-only confirm guard");
    test.skip(
      !hasMemberTradingFixtures() || !hasMerchantOrderE2eEnv(),
      "Missing buyer auth or merchant order seed env",
    );

    const { orderId } = await seedMerchantAuthConfirmGuardNegative();

    await ensureMemberPersona(page);
    await gotoOrderDetail(page, orderId);
    await dismissBlockingOverlays(page);

    await expect(page.getByText("待買家收貨")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("button", { name: "確認收貨" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "確認完成交易" })).toHaveCount(
      0,
    );
  });
});
