// @partner-id P-A09
// @features F-M-17
// @path Partner

import { test, expect } from "@playwright/test";
import { hasMemberTradingFixtures } from "../../fixtures/test-data";
import { ensureMemberPersona } from "../../helpers/collection-asset";
import { dismissBlockingOverlays } from "../../helpers/overlays";
import { gotoOrderDetail } from "../../helpers/member-trading";
import {
  hasGradingPartnerE2eEnv,
  seedMemberAuthAwaitingBuyerConfirm,
} from "../../helpers/grading-partner";

test.use({ viewport: { width: 1280, height: 900 } });
test.setTimeout(120_000);

test.describe("P-A09 C2C auth confirm-receipt dialog", () => {
  test("buyer confirm CTA opens 確認完成交收 checklist", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "buyer", "Buyer-only confirm dialog");
    test.skip(
      !hasMemberTradingFixtures() || !hasGradingPartnerE2eEnv(),
      "Missing buyer auth or grading partner seed env",
    );

    const seed = await seedMemberAuthAwaitingBuyerConfirm({
      suffix: `p-a09-${Date.now()}`,
    });

    await ensureMemberPersona(page);
    await gotoOrderDetail(page, seed.orderId);
    await dismissBlockingOverlays(page);

    const confirmButton = page.getByRole("button", { name: "確認收貨" });
    await expect(confirmButton).toBeVisible({ timeout: 20_000 });
    await confirmButton.click();
    await expect(
      page.getByRole("heading", { name: "確認完成交收" }),
    ).toBeVisible({ timeout: 15_000 });
    await expect(
      page.getByRole("button", { name: "確認完成交收" }),
    ).toBeDisabled();
  });
});
