// @partner-id P-C01
// @features F-M-18
// @path Partner

import { test, expect } from "@playwright/test";
import { hasMemberTradingFixtures } from "../../fixtures/test-data";
import { ensureMemberPersona } from "../../helpers/collection-asset";
import {
  gotoTradingPage,
  selectTradingStatusTab,
  waitForTradingListSettled,
} from "../../helpers/member-trading";
import {
  hasMerchantOrderE2eEnv,
  seedMerchantPendingPaymentOrder,
} from "../../helpers/merchant-orders";

test.use({ viewport: { width: 1280, height: 900 } });
test.setTimeout(180_000);

function parseParenCount(label: string): number {
  const match = label.match(/[（(](\d+)[）)]/);
  return match ? Number(match[1]) : 0;
}

test.describe("P-C01 member trading filter chip counts", () => {
  test("待處理 chip count stays stable after tab click", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "buyer", "Buyer-only trading chips");
    test.skip(
      !hasMemberTradingFixtures() || !hasMerchantOrderE2eEnv(),
      "Missing buyer auth or merchant seed env",
    );

    await seedMerchantPendingPaymentOrder();
    await ensureMemberPersona(page);
    await gotoTradingPage(page);

    const pendingChip = page.getByRole("button", { name: /^待處理/ }).first();
    await expect(pendingChip).toBeVisible({ timeout: 20_000 });
    const chipCount = parseParenCount((await pendingChip.innerText()).trim());
    expect(chipCount).toBeGreaterThan(0);

    await selectTradingStatusTab(page, "待處理");
    await waitForTradingListSettled(page);

    await expect(page.locator("#user-trading-heading")).toHaveText("交易管理");
    await expect
      .poll(
        async () =>
          parseParenCount((await pendingChip.innerText()).trim()),
        { timeout: 20_000 },
      )
      .toBe(chipCount);
  });
});
