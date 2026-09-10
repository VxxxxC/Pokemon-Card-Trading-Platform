import { test, expect, type Page } from "@playwright/test";
import { hasAdminAuthFixtures, loginAsAdmin, gotoAdminPage } from "./helpers/admin-auth";

test.describe("Admin grading workbench smoke", () => {
  test.use({ viewport: { width: 1440, height: 900 } });
  test.setTimeout(90_000);

  test("admin opens grading queue with awaiting intake tab", async (
    { page },
    testInfo,
  ) => {
    test.skip(testInfo.project.name !== "guest", "Guest-only: admin logs in via /auth");
    test.skip(!hasAdminAuthFixtures(), "Missing E2E_ADMIN_EMAIL or E2E_ADMIN_PASSWORD");

    await loginAsAdmin(page);
    await gotoAdminPage(page, "/admin/grading");

    await expect(
      page.getByRole("heading", { name: "鑑定工作台" }),
    ).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("button", { name: "待入庫" })).toBeVisible();
    await expect(page.getByRole("button", { name: "鑑定中" })).toBeVisible();
  });
});
