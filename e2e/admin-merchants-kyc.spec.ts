import { test, expect } from "@playwright/test";
import {
  gotoAdminPage,
  hasAdminAuthFixtures,
  loginAsAdmin,
} from "./helpers/admin-auth";

test.use({ viewport: { width: 1280, height: 900 } });
test.setTimeout(120_000);

test.describe("Admin merchants KYC workbench (F-A-07)", () => {
  test("admin merchants page loads review filters and table shell", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "guest", "Admin-only KYC workbench");
    test.skip(!hasAdminAuthFixtures(), "Missing admin credentials");

    await loginAsAdmin(page);
    const response = await gotoAdminPage(page, "/admin/merchants");
    expect(response?.status()).toBe(200);

    await expect(page.getByRole("heading", { name: "商戶與 KYC 審查" })).toBeVisible({
      timeout: 20_000,
    });

    for (const label of ["全部", "待審核", "已批准", "已拒絕"]) {
      await expect(page.getByRole("button", { name: label }).first()).toBeVisible();
    }

    await expect(page.getByRole("columnheader", { name: "公司名稱" })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "申請狀態" })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "操作" })).toBeVisible();
  });
});
