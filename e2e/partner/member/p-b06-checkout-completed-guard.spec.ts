// @partner-id P-B06
// @features F-M-19
// @path Partner

import { test, expect } from "@playwright/test";
import { hasMemberTradingFixtures } from "../../fixtures/test-data";
import { ensureMemberPersona } from "../../helpers/collection-asset";
import { gotoCheckout } from "../../helpers/member-trading";
import { dismissBlockingOverlays } from "../../helpers/overlays";
import {
  hasMerchantOrderE2eEnv,
  seedMerchantAuthAwaitingBuyerConfirm,
} from "../../helpers/merchant-orders";

test.use({ viewport: { width: 1280, height: 900 } });
test.setTimeout(120_000);

test.describe("P-B06 completed checkout guard", () => {
  test("paid merchant order checkout disables 繼續付款", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "buyer", "Buyer-only checkout guard");
    test.skip(
      !hasMemberTradingFixtures() || !hasMerchantOrderE2eEnv(),
      "Missing buyer auth or Supabase seed env",
    );

    const { orderId } = await seedMerchantAuthAwaitingBuyerConfirm();

    await ensureMemberPersona(page);
    await gotoCheckout(page, orderId);
    await dismissBlockingOverlays(page);

    await expect(
      page.getByText("此訂單已完成付款或已進入下一階段，無法重複支付。"),
    ).toBeVisible({ timeout: 20_000 });
    await expect(
      page.getByRole("button", { name: /繼續付款/ }),
    ).toBeDisabled();
  });
});
