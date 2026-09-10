// @partner-id P-B02
// @features F-M-04
// @path Partner

import { test, expect } from "@playwright/test";
import {
  dismissBlockingOverlays,
  suppressTransientHomeOverlays,
} from "../../helpers/overlays";

test.use({ viewport: { width: 1280, height: 900 } });
test.setTimeout(60_000);

test.describe("P-B02 home ticker live data", () => {
  test("price ticker is not the hardcoded mock Charizard set", async ({
    page,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== "buyer",
      "Buyer-only home ticker live data",
    );

    await suppressTransientHomeOverlays(page);
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await dismissBlockingOverlays(page);

    const ticker = page.getByLabel("最新平台成交");
    await expect(ticker).toBeVisible({ timeout: 20_000 });
    await expect(ticker.getByText("sv2a-182")).toHaveCount(0);
    await expect(ticker.getByText("Charizard ex SAR")).toHaveCount(0);
  });
});
