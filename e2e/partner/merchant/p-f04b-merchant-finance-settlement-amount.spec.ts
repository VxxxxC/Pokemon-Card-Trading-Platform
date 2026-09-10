// @partner-id P-F04B
// @features F-C-06
// @path Partner — merchant finance settlement amount contract

import { test } from "@playwright/test";
import { ensureMerchantPersona } from "../../helpers/collection-asset";
import {
  assertMerchantFinanceSettlementAmountOnPage,
  ensureMerchantFinanceSettlementRow,
} from "../../helpers/order-financial-contract";
import { dismissBlockingOverlays } from "../../helpers/overlays";
import {
  hasMerchantFinanceE2eEnv,
  resolveE2eSellerProfileId,
} from "../../helpers/partner-data-contract-env";

test.use({ viewport: { width: 1280, height: 900 } });
test.setTimeout(180_000);

test.describe("P-F04B merchant finance settlement amount", () => {
  test("finance settlement row amount matches DB merchant_payout_amount", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "seller", "Seller-only merchant finance");
    if (!(await hasMerchantFinanceE2eEnv())) {
      test.skip(
        true,
        "E2E seller must be merchant role with Supabase admin env",
      );
    }

    const merchantId = await resolveE2eSellerProfileId();
    if (!merchantId) {
      test.skip(true, "Could not resolve merchant profile");
      return;
    }

    const snapshot = await ensureMerchantFinanceSettlementRow({ merchantId });

    await ensureMerchantPersona(page);
    await page.goto("/profile/merchant/finance", {
      waitUntil: "domcontentloaded",
    });
    await dismissBlockingOverlays(page);

    await assertMerchantFinanceSettlementAmountOnPage(page, snapshot);
  });
});
