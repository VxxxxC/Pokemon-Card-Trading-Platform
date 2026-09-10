import { test, expect } from "@playwright/test";

test.use({ viewport: { width: 1280, height: 900 } });
test.setTimeout(60_000);

test.describe("Legal pages smoke (M4)", () => {
  test("terms page renders", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "guest", "Guest-only smoke");

    await page.goto("/terms", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.locator("article")).toBeVisible();
  });

  test("privacy page renders", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "guest", "Guest-only smoke");

    await page.goto("/privacy", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.locator("article")).toBeVisible();
  });
});
