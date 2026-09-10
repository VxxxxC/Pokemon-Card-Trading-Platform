// @partner-id P-E14
// @features F-A-06
// @path Partner — G-W1 admin grading outbound tracking

import { test, expect } from "@playwright/test";
import {
  gotoAdminPage,
  hasAdminAuthFixtures,
  loginAsAdmin,
} from "../../helpers/admin-auth";
import {
  getMemberOrderOutboundTracking,
  hasGradingPartnerE2eEnv,
  pollMemberOrderAwaitingOutboundSeed,
  seedMemberAuthAwaitingOutbound,
} from "../../helpers/grading-partner";
import {
  filterAdminGradingOrderKind,
  openAdminGradingTab,
  waitForAdminGradingOrderRow,
} from "../../helpers/admin-grading";
import { dismissBlockingOverlays } from "../../helpers/overlays";

test.use({ viewport: { width: 1440, height: 900 } });
test.setTimeout(240_000);

test.describe("P-E14 G-W1 admin grading outbound", () => {
  test("admin submits outbound tracking on awaiting_outbound tab", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "buyer", "Admin login on buyer project");
    test.skip(
      !hasAdminAuthFixtures() || !hasGradingPartnerE2eEnv(),
      "Missing admin or grading partner seed env",
    );

    const trackingNo = `SF-P-E14-${Date.now()}`;
    const seed = await seedMemberAuthAwaitingOutbound({
      suffix: `p-e14-${Date.now()}`,
    });
    await pollMemberOrderAwaitingOutboundSeed(seed.orderId);

    await loginAsAdmin(page);
    await gotoAdminPage(page, "/admin/grading");
    await dismissBlockingOverlays(page);

    await expect(page.getByRole("heading", { name: "鑑定工作台" })).toBeVisible({
      timeout: 30_000,
    });

    await openAdminGradingTab(page, "待出庫");
    await filterAdminGradingOrderKind(page, "member");

    const row = await waitForAdminGradingOrderRow(page, seed.orderNumber);
    await row.getByRole("button", { name: "處理" }).click();

    await page.locator('input[placeholder="出庫物流單號"]').fill(trackingNo);
    await page.getByRole("button", { name: "提交出庫物流" }).click();

    await expect(page.getByText("出庫物流已更新")).toBeVisible({
      timeout: 20_000,
    });

    await expect
      .poll(async () => getMemberOrderOutboundTracking(seed.orderId), {
        timeout: 15_000,
      })
      .toBe(trackingNo);
  });
});
