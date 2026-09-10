import { test, expect } from "@playwright/test";
import { hasChatRealtimeFixtures } from "./fixtures/chat-test-data";
import { dismissBlockingOverlays } from "./helpers/overlays";

test.use({ viewport: { width: 1280, height: 900 } });
test.setTimeout(120_000);

test.describe("Member inventory smoke", () => {
  test("seller inventory page lists active listings", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "seller", "Seller-only inventory smoke");
    if (!hasChatRealtimeFixtures()) {
      test.skip(
        true,
        "Missing seller auth, listing fixtures, or SUPABASE_SERVICE_ROLE_KEY",
      );
    }

    await page.goto("/profile/user/inventory", {
      waitUntil: "domcontentloaded",
    });
    await dismissBlockingOverlays(page);

    await expect(page.locator("#listings-heading")).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByRole("tab", { name: /上架中/ })).toBeVisible();
    await expect(
      page.getByText(/張實物現貨|暫無上架中商品|載入中/).first(),
    ).toBeVisible();
  });
});
