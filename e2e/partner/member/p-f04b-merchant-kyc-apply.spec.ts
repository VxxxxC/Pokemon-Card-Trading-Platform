// @partner-id P-F04B
// @features F-C-08
// @path Partner

import { test, expect } from "@playwright/test";
import { hasBuyerAuthFixtures } from "../../fixtures/test-data";
import { ensureMemberPersona } from "../../helpers/collection-asset";
import { dismissBlockingOverlays } from "../../helpers/overlays";

test.use({ viewport: { width: 1280, height: 900 } });
test.setTimeout(60_000);

test.describe("P-F04B merchant KYC apply", () => {
  test("buyer merchant-apply shows KYC heading", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "buyer", "Buyer-only KYC apply");
    test.skip(!hasBuyerAuthFixtures(), "Missing buyer auth");

    await ensureMemberPersona(page);
    await page.goto("/profile/user/merchant-apply", {
      waitUntil: "domcontentloaded",
    });
    await dismissBlockingOverlays(page);
    await expect(
      page.getByRole("heading", { name: /商戶入駐申請/ }),
    ).toBeVisible({ timeout: 20_000 });
  });
});
