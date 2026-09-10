import { test, expect } from "@playwright/test";

test.use({ viewport: { width: 1280, height: 900 } });
test.setTimeout(60_000);

test.describe("Public announcements list smoke (F-M-24)", () => {
  test("guest announcements page renders", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "guest", "Guest-only smoke");

    await page.goto("/announcements", { waitUntil: "domcontentloaded" });
    await expect(
      page.getByRole("heading", { name: "平台官方公告" }),
    ).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("button", { name: /進行中活動/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /過往公告/ })).toBeVisible();
  });
});
