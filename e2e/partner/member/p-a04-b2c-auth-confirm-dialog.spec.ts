// @partner-id P-A04
// @features F-M-17
// @path Partner

import { test, expect } from "@playwright/test";
import { hasMemberTradingFixtures } from "../../fixtures/test-data";
import { ensureMemberPersona } from "../../helpers/collection-asset";
import { dismissBlockingOverlays } from "../../helpers/overlays";
import { gotoOrderDetail } from "../../helpers/member-trading";
import {
  hasMerchantOrderE2eEnv,
  seedMerchantAuthAwaitingBuyerConfirm,
} from "../../helpers/merchant-orders";

test.use({ viewport: { width: 1280, height: 900 } });
test.setTimeout(120_000);

test.describe("P-A04 B2C auth confirm-receipt dialog", () => {
  test("buyer confirm CTA opens 確認完成交收 checklist", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "buyer", "Buyer-only confirm dialog");
    test.skip(
      !hasMemberTradingFixtures() || !hasMerchantOrderE2eEnv(),
      "Missing buyer auth or Supabase seed env",
    );

    const { orderId } = await seedMerchantAuthAwaitingBuyerConfirm();

    await ensureMemberPersona(page);
    await gotoOrderDetail(page, orderId);
    await dismissBlockingOverlays(page);

    const confirmButton = page.getByRole("button", { name: "確認完成交易" });
    await expect(confirmButton).toBeVisible({ timeout: 20_000 });
    await confirmButton.click();
    await expect(
      page.getByRole("heading", { name: "確認完成交收" }),
    ).toBeVisible({ timeout: 15_000 });
    await expect(
      page.getByRole("checkbox", {
        name: "官方卡牌編號與稀有度標籤（如 SAR/UR/SR）",
      }),
    ).toBeVisible();
  });
});
