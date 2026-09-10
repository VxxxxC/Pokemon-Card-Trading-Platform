// @partner-id P-F01
// @features F-M-01, F-M-02, F-M-03, F-M-09, F-M-12
// @path Partner

import { test, expect } from "@playwright/test";
import { hasBuyerAuthFixtures } from "../../fixtures/test-data";
import { dismissBlockingOverlays } from "../../helpers/overlays";

test.use({ viewport: { width: 1280, height: 900 } });
test.setTimeout(90_000);

test.describe("P-F01 member auth and dashboard shell", () => {
  test("dashboard, settings, password reset, logout, suspended page", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "buyer", "Buyer-only member shell");
    test.skip(!hasBuyerAuthFixtures(), "Missing buyer auth");

    await page.goto("/profile/user", { waitUntil: "domcontentloaded" });
    await dismissBlockingOverlays(page);
    await expect(page.getByText("帳戶總積分餘額")).toBeVisible({
      timeout: 20_000,
    });
    await expect(
      page.getByRole("heading", { name: "待處理訂單" }),
    ).toBeVisible();

    await page.goto("/profile/user/settings", {
      waitUntil: "domcontentloaded",
    });
    await dismissBlockingOverlays(page);
    await expect(page.getByText("帳戶設定")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText("個人資料")).toBeVisible();
    await expect(page.getByRole("button", { name: "儲存更改" })).toBeVisible();
    await expect(page.getByRole("link", { name: "更改" })).toHaveAttribute(
      "href",
      "/auth/reset-password",
    );

    await page.getByRole("button", { name: "登出" }).click();
    await expect(
      page.getByRole("heading", { name: "確認登出" }),
    ).toBeVisible({ timeout: 10_000 });
    await page.keyboard.press("Escape");

    await page.goto("/auth/suspended?type=suspend", {
      waitUntil: "domcontentloaded",
    });
    await expect(page.getByText("帳戶已暫停")).toBeVisible({ timeout: 15_000 });
    await expect(
      page.getByRole("button", { name: "登出並返回登入" }),
    ).toBeVisible();
  });
});
