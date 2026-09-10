// @partner-id P-E13
// @features F-A-06
// @path Partner — CC-GRD admin grading queue tabs

import { test, expect } from "@playwright/test";
import {
  gotoAdminPage,
  hasAdminAuthFixtures,
  loginAsAdmin,
} from "../../helpers/admin-auth";

const GRADING_TABS = [
  "待入庫",
  "鑑定中",
  "待出庫",
  "待追償／寄回",
  "已結案／退款",
] as const;

test.use({ viewport: { width: 1440, height: 900 } });
test.setTimeout(180_000);

test.describe("P-E13 admin grading queue tabs", () => {
  test("grading workbench tabs load queue table or empty state", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "buyer", "Admin login on buyer project");
    test.skip(
      !hasAdminAuthFixtures(),
      "Missing E2E_ADMIN_EMAIL or E2E_ADMIN_PASSWORD",
    );

    await loginAsAdmin(page);
    await gotoAdminPage(page, "/admin/grading");

    await expect(page.getByRole("heading", { name: "鑑定工作台" })).toBeVisible({
      timeout: 30_000,
    });

    for (const tabLabel of GRADING_TABS) {
      await page.getByRole("button", { name: tabLabel }).click();
      await expect(page.getByRole("button", { name: tabLabel })).toBeVisible({
        timeout: 10_000,
      });

      const table = page.getByRole("table");
      const emptyState = page.getByText(/此分頁暫無訂單|暫無紀錄/);
      const hasTable = await table.isVisible().catch(() => false);
      const hasEmpty = await emptyState.first().isVisible().catch(() => false);
      expect(hasTable || hasEmpty).toBe(true);
    }
  });
});
