// @partner-id P-E08C
// @features F-M-19, F-S-08
// @path Partner — merchant_direct auth toggle checkout breakdown

import { test } from "@playwright/test";
import { getProfileIdByEmail } from "../../fixtures/supabase-admin";
import {
  getMerchantProductDetailFixtures,
  hasBuyerAuthFixtures,
} from "../../fixtures/test-data";
import {
  assertAuthEscrowCheckoutBreakdownOnPage,
  enableAuthServiceOnMerchantDirectCheckout,
} from "../../helpers/checkout-display-contract";
import { hasSupabaseAdminE2eEnv } from "../../helpers/partner-data-contract-env";
import { dismissBlockingOverlays } from "../../helpers/overlays";
import {
  buyMerchantListingAndReachCheckout,
  findActiveMerchantListingForE2e,
  reactivateListingForE2e,
  setListingAuthenticationForE2e,
} from "../../helpers/platform-rewards";

test.use({ viewport: { width: 1280, height: 900 } });
test.setTimeout(180_000);

test.describe("P-E08C merchant_direct auth toggle breakdown", () => {
  test("merchant_direct auth toggle updates checkout breakdown with SF legs", async ({
    page,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== "buyer",
      "Buyer-only merchant direct auth toggle",
    );
    test.skip(!hasBuyerAuthFixtures(), "Missing buyer credentials");
    test.skip(!hasSupabaseAdminE2eEnv(), "Missing Supabase admin seed env");

    const fixtures = getMerchantProductDetailFixtures();
    const buyerId = await getProfileIdByEmail(fixtures.buyerEmail!);
    const merchantListing = await findActiveMerchantListingForE2e({
      excludeSellerId: buyerId!,
    });

    await reactivateListingForE2e(merchantListing.listingId);
    await setListingAuthenticationForE2e(merchantListing.listingId, true);

    await buyMerchantListingAndReachCheckout(
      page,
      merchantListing.sellerId,
      merchantListing.listingId,
    );
    await dismissBlockingOverlays(page);

    await enableAuthServiceOnMerchantDirectCheckout(page);
    await assertAuthEscrowCheckoutBreakdownOnPage(page);
  });
});
