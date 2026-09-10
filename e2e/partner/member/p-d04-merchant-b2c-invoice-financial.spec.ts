// @partner-id P-D04
// @features F-M-17, F-M-19
// @path Partner — merchant B2C order detail invoice financial rows

import { test } from "@playwright/test";
import { hasBuyerAuthFixtures } from "../../fixtures/test-data";
import { ensureMemberPersona } from "../../helpers/collection-asset";
import { gotoOrderDetail } from "../../helpers/member-trading";
import {
  assertMerchantB2cInvoiceMatchesSnapshot,
  getMerchantOrderFinancialSnapshot,
} from "../../helpers/order-financial-contract";
import { dismissBlockingOverlays } from "../../helpers/overlays";
import {
  hasMerchantOrderE2eEnv,
  seedMerchantShippedOrderForSellerDetail,
} from "../../helpers/merchant-orders";

test.use({ viewport: { width: 1280, height: 900 } });
test.setTimeout(120_000);

test.describe("P-D04 merchant B2C invoice financial contract", () => {
  test("buyer B2C invoice rows match DB merchant order snapshot", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "buyer", "Buyer-only B2C invoice");
    test.skip(
      !hasBuyerAuthFixtures() || !hasMerchantOrderE2eEnv(),
      "Missing buyer auth or Supabase seed env",
    );

    const { orderId } = await seedMerchantShippedOrderForSellerDetail({
      suffix: `p-d04-${Date.now()}`,
    });
    const snapshot = await getMerchantOrderFinancialSnapshot(orderId);

    await ensureMemberPersona(page);
    await gotoOrderDetail(page, orderId);
    await dismissBlockingOverlays(page);

    await assertMerchantB2cInvoiceMatchesSnapshot(page, snapshot);
  });
});
