// @partner-id P-F03
// @features F-M-20, F-M-21, F-M-22
// @path Partner

import { test, expect } from "@playwright/test";
import { resolveE2eMarketplaceFixture } from "../../fixtures/supabase-admin";
import {
  buildPublicProfilePath,
  hasBuyerAuthFixtures,
  hasCoreMerchantFixtures,
} from "../../fixtures/test-data";
import { ensureMemberPersona } from "../../helpers/collection-asset";
import { dismissBlockingOverlays } from "../../helpers/overlays";

test.use({ viewport: { width: 1280, height: 900 } });
test.setTimeout(90_000);

test.describe("P-F03 member rewards and report", () => {
  test("rewards wallet and profile report dialog", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "buyer", "Buyer-only rewards/report");
    test.skip(
      !hasBuyerAuthFixtures() || !hasCoreMerchantFixtures(),
      "Missing buyer or listing fixtures",
    );

    const fixtureResult = await resolveE2eMarketplaceFixture();
    if (!fixtureResult.ok) {
      test.skip(true, fixtureResult.skipReason);
      return;
    }

    await ensureMemberPersona(page);
    await page.goto("/profile/user/rewards", { waitUntil: "domcontentloaded" });
    await dismissBlockingOverlays(page);
    await expect(page.getByText("可使用")).toBeVisible({
      timeout: 20_000,
    });
    await expect(
      page.getByRole("link", { name: /限時搶券.*積分商城/ }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "我的優惠劵" }),
    ).toBeVisible();

    await page.goto("/profile/user/campaigns", { waitUntil: "domcontentloaded" });
    await dismissBlockingOverlays(page);
    await expect(
      page.getByRole("button", { name: "限時搶券" }),
    ).toBeVisible({ timeout: 20_000 });

    await page.goto(buildPublicProfilePath(fixtureResult.fixture.sellerId), {
      waitUntil: "domcontentloaded",
    });
    await dismissBlockingOverlays(page);
    await expect(page.getByText("總完成交易")).toBeVisible({ timeout: 20_000 });
    await page.getByRole("button", { name: /舉報用戶/ }).click();
    const reportDialog = page.getByRole("alertdialog");
    await expect(reportDialog).toBeVisible({ timeout: 10_000 });
    await reportDialog.getByRole("combobox").click();
    await expect(
      page.getByRole("option", { name: /惡意欺詐 \/ 虛假交易/ }),
    ).toBeVisible();
    await page.keyboard.press("Escape");
  });
});
