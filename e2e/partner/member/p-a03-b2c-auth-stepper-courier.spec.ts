// @partner-id P-A03
// @features F-M-17, F-C-10
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

test.describe("P-A03 B2C auth courier buyer stepper", () => {
  test("auth + 寄貨 order shows escrow steps, not meetup 待面交", async ({
    page,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== "buyer",
      "Buyer-only B2C auth stepper",
    );
    test.skip(
      !hasMemberTradingFixtures() || !hasMerchantOrderE2eEnv(),
      "Missing buyer auth or Supabase seed env",
    );

    const { orderId } = await seedMerchantAuthAwaitingBuyerConfirm();

    await ensureMemberPersona(page);
    await gotoOrderDetail(page, orderId);
    await dismissBlockingOverlays(page);

    await expect(page.getByText("交易狀態")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText("待買家收貨")).toBeVisible();
    await expect(page.getByText("鑑定中")).toBeVisible();
    await expect(page.getByText("待入庫")).toBeVisible();
    await expect(page.getByText("待面交")).toHaveCount(0);
  });
});
