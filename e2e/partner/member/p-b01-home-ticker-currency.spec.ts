// @partner-id P-B01
// @features F-M-04
// @path Partner

import { test, expect } from "@playwright/test";
import {
  dismissBlockingOverlays,
  suppressTransientHomeOverlays,
} from "../../helpers/overlays";

test.use({ viewport: { width: 1280, height: 900 } });
test.setTimeout(60_000);

test.describe("P-B01 home ticker HKD currency", () => {
  test("price ticker uses HK$ not ¥", async ({ page }, testInfo) => {
    test.skip(
      testInfo.project.name !== "buyer",
      "Buyer-only home ticker currency",
    );

    await suppressTransientHomeOverlays(page);
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await dismissBlockingOverlays(page);

    const ticker = page.getByLabel("最新平台成交");
    await expect(ticker).toBeVisible({ timeout: 20_000 });
    await expect(ticker.getByText(/HK\$/).first()).toBeVisible();
    await expect(ticker.getByText(/¥/)).toHaveCount(0);
  });
});
