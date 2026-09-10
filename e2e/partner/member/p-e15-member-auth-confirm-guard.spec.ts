// @partner-id P-E15
// @features F-M-17, F-S-08
// @path Partner — G-CONF1 member auth confirm guard (UI)

import { test, expect } from "@playwright/test";
import { hasMemberTradingFixtures } from "../../fixtures/test-data";
import { ensureMemberPersona } from "../../helpers/collection-asset";
import { dismissBlockingOverlays } from "../../helpers/overlays";
import { gotoOrderDetail } from "../../helpers/member-trading";
import {
  hasGradingPartnerE2eEnv,
  seedMemberAuthConfirmGuardNegative,
} from "../../helpers/grading-partner";

test.use({ viewport: { width: 1280, height: 900 } });
test.setTimeout(120_000);

test.describe("P-E15 G-CONF1 member auth confirm guard", () => {
  test("buyer cannot confirm receipt before payment fully captured", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "buyer", "Buyer-only confirm guard");
    test.skip(
      !hasMemberTradingFixtures() || !hasGradingPartnerE2eEnv(),
      "Missing buyer auth or grading partner seed env",
    );

    const seed = await seedMemberAuthConfirmGuardNegative({
      suffix: `p-e15-${Date.now()}`,
    });

    await ensureMemberPersona(page);
    await gotoOrderDetail(page, seed.orderId);
    await dismissBlockingOverlays(page);

    await expect(page.getByText("運送中")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("button", { name: "確認收貨" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "確認完成交易" })).toHaveCount(
      0,
    );
  });
});
