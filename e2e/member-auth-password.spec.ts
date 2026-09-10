import { test, expect } from "@playwright/test";

test.use({ viewport: { width: 1280, height: 900 } });
test.setTimeout(60_000);

test.describe("Member auth password recovery smoke (F-M-02)", () => {
  test("guest forgot-password page renders", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "guest", "Guest-only smoke");

    await page.goto("/auth/forgot-password", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "忘記密碼" })).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByLabel("電子郵件")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "發送重設連結" }),
    ).toBeVisible();
  });

  test("guest auth links to forgot-password", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "guest", "Guest-only smoke");

    await page.goto("/auth", { waitUntil: "domcontentloaded" });
    await page.getByRole("link", { name: "忘記密碼？" }).click();
    await expect(page).toHaveURL(/\/auth\/forgot-password/, {
      timeout: 15_000,
    });
    await expect(page.getByRole("heading", { name: "忘記密碼" })).toBeVisible();
  });

  test("guest reset-password redirects to forgot-password", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "guest", "Guest-only smoke");

    await page.goto("/auth/reset-password", { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/auth\/forgot-password/, {
      timeout: 15_000,
    });
  });

  test("buyer settings links to reset-password", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "buyer", "Buyer-only smoke");

    await page.goto("/profile/user/settings", {
      waitUntil: "domcontentloaded",
    });
    await expect(page).not.toHaveURL(/\/auth(?:\?|$)/, { timeout: 20_000 });
    await expect(page.getByText("登入密碼")).toBeVisible({ timeout: 20_000 });
    const changePasswordLink = page.getByRole("link", { name: "更改" });
    await expect(changePasswordLink).toBeVisible({ timeout: 20_000 });
    await expect(changePasswordLink).toHaveAttribute("href", "/auth/reset-password");
  });
});
