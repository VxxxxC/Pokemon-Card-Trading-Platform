// @partner-id P-F05
// @features F-A-01, F-A-02, F-A-03, F-A-04, F-A-05, F-A-05b, F-A-06, F-A-07, F-A-08, F-A-09, F-A-10, F-A-11, F-A-12, F-A-13, F-A-14, F-M-23, F-S-01, F-S-02, F-S-03, F-S-04, F-S-07, F-S-09, F-S-10
// @path Partner

import { test, expect } from "@playwright/test";
import {
  gotoAdminPage,
  hasAdminAuthFixtures,
  loginAsAdmin,
} from "../../helpers/admin-auth";

test.use({ viewport: { width: 1440, height: 900 } });
test.setTimeout(180_000);

test.describe("P-F05 admin ops shells", () => {
  test("admin workbenches load visible headings", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "buyer", "Admin login on buyer project");
    test.skip(
      !hasAdminAuthFixtures(),
      "Missing E2E_ADMIN_EMAIL or E2E_ADMIN_PASSWORD",
    );

    await loginAsAdmin(page);

    await gotoAdminPage(page, "/admin/dashboard");
    await expect(page.getByText("平台淨營收統計")).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByText("Stripe 平台餘額")).toBeVisible();

    await gotoAdminPage(page, "/admin/settings");
    await expect(page.locator("#financials-heading")).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByText("單張卡牌保管鑑定費")).toBeVisible();

    await gotoAdminPage(page, "/admin/campaigns");
    await expect(
      page.getByRole("heading", { name: "積分與獎勵活動" }),
    ).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("button", { name: "簽到計劃" })).toBeVisible();

    await gotoAdminPage(page, "/admin/disputes");
    await expect(
      page.getByRole("heading", { name: "舉報與爭議仲裁工作台" }),
    ).toBeVisible({ timeout: 20_000 });

    await gotoAdminPage(page, "/admin/grading");
    await expect(page.getByRole("heading", { name: "鑑定工作台" })).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByRole("button", { name: "待入庫" })).toBeVisible();

    await gotoAdminPage(page, "/admin/merchants");
    await expect(
      page.getByRole("heading", { name: "商戶與 KYC 審查" }),
    ).toBeVisible({ timeout: 20_000 });

    await gotoAdminPage(page, "/admin/user_control");
    await expect(page.getByRole("heading", { name: "用戶管理" })).toBeVisible({
      timeout: 20_000,
    });

    await gotoAdminPage(page, "/admin/catalog");
    await expect(page.getByRole("button", { name: "手動錄入卡牌" })).toBeVisible({
      timeout: 20_000,
    });

    await gotoAdminPage(page, "/admin/payouts");
    await expect(
      page.getByRole("heading", { name: "財務與結算管控台" }),
    ).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText("FPS 批次處理")).toBeVisible();

    await gotoAdminPage(page, "/admin/announcements");
    await expect(
      page.getByRole("heading", { name: "首頁活動與公告管理" }),
    ).toBeVisible({ timeout: 20_000 });
  });
});
