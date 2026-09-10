// @partner-id P-B08
// @features F-M-10, F-C-03
// @path Partner

import { test, expect } from "@playwright/test";
import { resolveE2eMarketplaceFixture } from "../../fixtures/supabase-admin";
import { hasMemberTradingFixtures } from "../../fixtures/test-data";
import { addHobbyHoldingForFixture } from "../../helpers/collection-asset";

test.use({ viewport: { width: 1280, height: 900 } });
test.setTimeout(180_000);

test.describe("P-B08 long BGS grading label", () => {
  test("BGS 10 黑 collection add succeeds", async ({ page }, testInfo) => {
    test.skip(
      testInfo.project.name !== "buyer",
      "Buyer-only collection grading label",
    );
    test.skip(!hasMemberTradingFixtures(), "Missing buyer auth");

    const fixtureResult = await resolveE2eMarketplaceFixture({
      requiredSellerPersona: "member",
    });
    if (!fixtureResult.ok) {
      test.skip(true, fixtureResult.skipReason);
      return;
    }

    await addHobbyHoldingForFixture(
      page,
      fixtureResult.fixture,
      `8${String(Date.now()).slice(-6)}`,
      {
        gradingOptionLabel: "BGS 10 黑",
      },
    );
    await expect(
      page.getByText(/varchar|value too long|character varying/i),
    ).toHaveCount(0);
  });
});
