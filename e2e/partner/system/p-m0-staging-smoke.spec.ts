// @partner-id P-M0
// @path Partner — mirrors docs/dev/PARTNER_QA.md M0 (~5 min staging deploy smoke)

import { test, expect } from "@playwright/test";
import { hasBuyerAuthFixtures } from "../../fixtures/test-data";
import {
  gotoAdminPage,
  hasAdminAuthFixtures,
  loginAsAdmin,
} from "../../helpers/admin-auth";
import { dismissBlockingOverlays } from "../../helpers/overlays";

test.use({ viewport: { width: 1280, height: 900 } });
test.setTimeout(120_000);

async function expectNoServerError(page: import("@playwright/test").Page) {
  await expect(page.getByText(/internal server error|500/i)).toHaveCount(0);
}

test.describe("P-M0 staging deploy smoke", () => {
  test("buyer session and rewards page load", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "buyer", "Buyer auth + rewards");
    test.skip(!hasBuyerAuthFixtures(), "Missing buyer auth fixtures");

    await page.goto("/profile/user", { waitUntil: "domcontentloaded" });
    await dismissBlockingOverlays(page);
    await expectNoServerError(page);
    await expect(page.getByText("帳戶總積分餘額")).toBeVisible({
      timeout: 20_000,
    });

    await page.goto("/profile/user/rewards", { waitUntil: "domcontentloaded" });
    await dismissBlockingOverlays(page);
    await expectNoServerError(page);
    await expect(
      page.getByRole("heading", { name: "會員獎勵與任務中心" }),
    ).toBeVisible({ timeout: 20_000 });
  });

  test("admin session disputes and grading load", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "buyer", "Admin login on buyer project");
    test.skip(!hasAdminAuthFixtures(), "Missing admin auth fixtures");

    await loginAsAdmin(page);
    await expectNoServerError(page);

    await gotoAdminPage(page, "/admin/disputes");
    await expectNoServerError(page);
    await expect(
      page.getByRole("heading", { name: "舉報與爭議仲裁工作台" }),
    ).toBeVisible({ timeout: 20_000 });

    await gotoAdminPage(page, "/admin/grading");
    await expectNoServerError(page);
    await expect(page.getByRole("heading", { name: "鑑定工作台" })).toBeVisible({
      timeout: 20_000,
    });
  });

  test("legal pages load for guests", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "guest", "Guest legal pages");

    await page.goto("/terms", { waitUntil: "domcontentloaded" });
    await expectNoServerError(page);
    await expect(page.getByRole("heading", { name: "服務條款" })).toBeVisible({
      timeout: 20_000,
    });

    await page.goto("/privacy", { waitUntil: "domcontentloaded" });
    await expectNoServerError(page);
    await expect(page.getByRole("heading", { name: "私隱政策" })).toBeVisible({
      timeout: 20_000,
    });
  });
});
