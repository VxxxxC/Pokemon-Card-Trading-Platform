// @partner-id P-A05
// @features F-M-16, F-M-17, F-S-08
// @path Partner

import { test, expect } from "@playwright/test";
import {
  getProfileIdByEmail,
  resolveE2eMarketplaceFixture,
} from "../../fixtures/supabase-admin";
import { getChatRealtimeFixtures } from "../../fixtures/chat-test-data";
import { hasMemberTradingFixtures } from "../../fixtures/test-data";
import { gotoOrderDetail } from "../../helpers/member-trading";
import { dismissBlockingOverlays } from "../../helpers/overlays";
import { ensureMemberPersona } from "../../helpers/collection-asset";
import {
  hasMerchantOrderE2eEnv,
  seedMemberAuthHeldForSellerInvoice,
} from "../../helpers/merchant-orders";
import { parseHkdAmount } from "../_helpers";

test.use({ viewport: { width: 1280, height: 900 } });
test.setTimeout(120_000);

test.describe("P-A05 C2C auth seller invoice vs FPS", () => {
  test("最終實收總額 matches 預計 FPS 到賬", async ({ page }, testInfo) => {
    test.skip(
      testInfo.project.name !== "seller",
      "Seller-only C2C auth invoice",
    );
    test.skip(
      !hasMemberTradingFixtures() || !hasMerchantOrderE2eEnv(),
      "Missing seller auth or Supabase seed env",
    );

    const fixtureResult = await resolveE2eMarketplaceFixture({
      requiredSellerPersona: "member",
    });
    if (!fixtureResult.ok) {
      test.skip(true, fixtureResult.skipReason);
      return;
    }

    const buyerEmail = getChatRealtimeFixtures().buyerEmail;
    const buyerId = buyerEmail ? await getProfileIdByEmail(buyerEmail) : null;
    if (!buyerId) {
      test.skip(true, "Could not resolve buyer profile");
      return;
    }

    const { orderId } = await seedMemberAuthHeldForSellerInvoice({
      listingId: fixtureResult.fixture.listingId,
      buyerId,
    });

    await ensureMemberPersona(page);
    await gotoOrderDetail(page, orderId);
    await dismissBlockingOverlays(page);

    const invoiceTotal = page
      .locator("div")
      .filter({ has: page.getByText("最終實收總額", { exact: true }) })
      .last();
    await expect(invoiceTotal.getByText("最終實收總額")).toBeVisible({
      timeout: 20_000,
    });
    const invoiceText = await invoiceTotal.innerText();
    const received = parseHkdAmount(invoiceText);

    const fpsRow = page.getByText(/預計 FPS 到賬/);
    await expect(fpsRow).toBeVisible({ timeout: 15_000 });
    const fpsText = await fpsRow.innerText();
    const fps = parseHkdAmount(fpsText);

    expect(received).toBe(fps);
  });
});
