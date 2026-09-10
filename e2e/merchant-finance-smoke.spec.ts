import { test, expect } from "@playwright/test";
import { hasMemberTradingFixtures } from "./fixtures/test-data";

test.use({ viewport: { width: 1280, height: 900 } });
test.setTimeout(120_000);

test.describe("Merchant finance smoke (F-C-06)", () => {
  test("seller finance page loads payout summary and Stripe Connect", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "seller", "Seller-only merchant finance");
    if (!hasMemberTradingFixtures()) {
      test.skip(true, "Missing seller auth fixtures");
    }

    await page.goto("/profile/merchant/finance", { waitUntil: "domcontentloaded" });

    await expect(page.getByText("本月撥款收入（已結算）")).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByRole("heading", { name: /撥款記錄/ })).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Stripe Connect 帳戶" }),
    ).toBeVisible();

    const connectBadge = page.getByText(/已連結 · Express 帳戶|待完成收款設定/);
    await expect(connectBadge).toBeVisible();
    await expect(
      page.getByRole("link", {
        name: /管理 Stripe 收款|完成 Stripe 收款設定/,
      }),
    ).toBeVisible();
  });
});
