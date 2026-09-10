// @partner-id P-E08D
// @features F-M-19, F-S-08
// @path Partner — merchant_direct SF shipping checkout breakdown

import { test } from "@playwright/test";
import { getProfileIdByEmail } from "../../fixtures/supabase-admin";
import {
  getMerchantProductDetailFixtures,
  hasBuyerAuthFixtures,
} from "../../fixtures/test-data";
import {
  assertMerchantDirectSfCheckoutBreakdownOnPage,
  getMerchantListingShippingQuote,
} from "../../helpers/checkout-display-contract";
import { hasSupabaseAdminE2eEnv } from "../../helpers/partner-data-contract-env";
import { dismissBlockingOverlays } from "../../helpers/overlays";
import {
  ensureCourierShippingSelected,
} from "../../helpers/rewards-checkout-coupon";
import {
  buyMerchantListingAndReachCheckout,
  findActiveMerchantListingForE2e,
  reactivateListingForE2e,
  setListingAuthenticationForE2e,
} from "../../helpers/platform-rewards";

test.use({ viewport: { width: 1280, height: 900 } });
test.setTimeout(180_000);

test.describe("P-E08D merchant_direct SF shipping breakdown", () => {
  test("merchant_direct checkout shows courier shipping fee before payment", async ({
    page,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== "buyer",
      "Buyer-only merchant direct SF checkout",
    );
    test.skip(!hasBuyerAuthFixtures(), "Missing buyer credentials");
    test.skip(!hasSupabaseAdminE2eEnv(), "Missing Supabase admin seed env");

    const fixtures = getMerchantProductDetailFixtures();
    const buyerId = await getProfileIdByEmail(fixtures.buyerEmail!);
    const merchantListing = await findActiveMerchantListingForE2e({
      excludeSellerId: buyerId!,
    });

    await reactivateListingForE2e(merchantListing.listingId);
    await setListingAuthenticationForE2e(merchantListing.listingId, false);

    const quote = await getMerchantListingShippingQuote(
      merchantListing.listingId,
    );

    await buyMerchantListingAndReachCheckout(
      page,
      merchantListing.sellerId,
      merchantListing.listingId,
    );
    await dismissBlockingOverlays(page);
    await ensureCourierShippingSelected(page);

    await assertMerchantDirectSfCheckoutBreakdownOnPage(page, quote);
  });
});
