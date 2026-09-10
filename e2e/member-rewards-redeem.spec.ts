import { test, expect } from "@playwright/test";
import { hasBuyerAuthFixtures } from "./fixtures/test-data";

test.use({ viewport: { width: 1280, height: 900 } });
test.setTimeout(120_000);

async function dismissBlockingOverlays(page: import("@playwright/test").Page) {
  const pwaClose = page.getByRole("button", { name: "✕" }).first();
  if (await pwaClose.isVisible().catch(() => false)) {
    await pwaClose.click();
  }
}

test.describe("Member rewards coupons", () => {
  test("buyer sees points store or coupon inventory on rewards page", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "buyer", "Buyer-only rewards redeem");
    if (!hasBuyerAuthFixtures()) {
      test.skip(true, "Missing E2E_BUYER_EMAIL or E2E_BUYER_PASSWORD");
    }

    await page.goto("/profile/user/rewards", { waitUntil: "domcontentloaded" });
    await dismissBlockingOverlays(page);

    await expect(page.getByText("可使用")).toBeVisible({
      timeout: 20_000,
    });

    await expect(
      page.getByRole("link", { name: /限時搶券.*積分商城/ }),
    ).toBeVisible({ timeout: 20_000 });
    await expect(
      page.getByRole("heading", { name: "我的優惠劵" }),
    ).toBeVisible({ timeout: 20_000 });

    await page.goto("/profile/user/campaigns", { waitUntil: "domcontentloaded" });
    await dismissBlockingOverlays(page);
    await page.getByRole("button", { name: "積分商城" }).click();
    await expect(page.getByText(/載入積分商城/)).toBeHidden({ timeout: 20_000 });
  });
});
