import { test, expect } from "@playwright/test";
import {
  hasAdminAuthFixtures,
  loginAsAdmin,
} from "./helpers/admin-auth";
import { openAdminCheckInTab } from "./helpers/platform-rewards";

test.use({ viewport: { width: 1280, height: 900 } });
test.setTimeout(120_000);

test.describe("Admin check-in program smoke (F-A-04)", () => {
  test("admin check-in tab loads save control", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "guest", "Admin-only check-in smoke");
    test.skip(!hasAdminAuthFixtures(), "Missing admin credentials");

    await loginAsAdmin(page);
    await openAdminCheckInTab(page);

    const saveButton = page.getByRole("button", { name: /儲存簽到計劃/ });
    if (await saveButton.isVisible().catch(() => false)) {
      await expect(page.getByText("簽滿 7 日額外獎勵")).toBeVisible();
      return;
    }

    await expect(page.getByText("找不到簽到計劃")).toBeVisible();
  });
});
