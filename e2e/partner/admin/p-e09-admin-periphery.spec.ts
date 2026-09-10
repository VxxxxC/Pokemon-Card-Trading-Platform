// @partner-id P-E09
// @features F-A-04, F-A-05, F-A-08, F-A-12, F-A-14
// @path Partner — TC-E09 admin periphery

import { test, expect } from "@playwright/test";
import {
  gotoAdminPage,
  hasAdminAuthFixtures,
  loginAsAdmin,
} from "../../helpers/admin-auth";

test.use({ viewport: { width: 1440, height: 900 } });
test.setTimeout(180_000);

test.describe("P-E09 admin periphery routes", () => {
  test("catalog, user control, payouts, and campaigns load", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "buyer", "Admin login on buyer project");
    test.skip(
      !hasAdminAuthFixtures(),
      "Missing E2E_ADMIN_EMAIL or E2E_ADMIN_PASSWORD",
    );

    await loginAsAdmin(page);

    await gotoAdminPage(page, "/admin/catalog");
    await expect(page.getByRole("button", { name: "手動錄入卡牌" })).toBeVisible({
      timeout: 20_000,
    });

    await gotoAdminPage(page, "/admin/user_control");
    await expect(page.getByRole("heading", { name: "用戶管理" })).toBeVisible({
      timeout: 20_000,
    });

    await gotoAdminPage(page, "/admin/payouts");
    await expect(
      page.getByRole("heading", { name: "財務與結算管控台" }),
    ).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText("FPS 批次處理")).toBeVisible();

    await gotoAdminPage(page, "/admin/campaigns");
    await expect(
      page.getByRole("heading", { name: "積分與獎勵活動" }),
    ).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("button", { name: "簽到計劃" })).toBeVisible();
  });
});
