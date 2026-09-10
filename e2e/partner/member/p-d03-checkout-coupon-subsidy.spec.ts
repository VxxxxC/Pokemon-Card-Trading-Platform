// @partner-id P-D03
// @features F-M-19, F-M-20
// @path Partner — checkout coupon subsidy data contract

import { test } from "@playwright/test";
import { getProfileIdByEmail } from "../../fixtures/supabase-admin";
import {
  getMerchantProductDetailFixtures,
  hasBuyerAuthFixtures,
} from "../../fixtures/test-data";
import { assertCheckoutCouponSubsidyOnPage } from "../../helpers/checkout-display-contract";
import { hasSupabaseAdminE2eEnv } from "../../helpers/partner-data-contract-env";
import { dismissBlockingOverlays } from "../../helpers/overlays";
import {
  buyMerchantListingAndReachCheckout,
  findActiveDiscountCouponTemplateId,
  findActiveMerchantListingForE2e,
  grantUserRewardForE2e,
  reactivateListingForE2e,
} from "../../helpers/platform-rewards";
import {
  readCheckoutSummaryAmounts,
  resolveCheckoutCouponTemplateIds,
  selectCheckoutCoupon,
  waitForCheckoutCouponPicker,
  waitForMerchantDirectCheckoutReady,
} from "../../helpers/rewards-checkout-coupon";

test.use({ viewport: { width: 1280, height: 900 } });
test.setTimeout(180_000);

test.describe("P-D03 checkout coupon subsidy contract", () => {
  test("selecting coupon updates platform subsidy and checkout total", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "buyer", "Buyer-only coupon subsidy");
    test.skip(!hasBuyerAuthFixtures(), "Missing buyer credentials");
    test.skip(!hasSupabaseAdminE2eEnv(), "Missing Supabase admin seed env");

    const fixtures = getMerchantProductDetailFixtures();
    const buyerId = await getProfileIdByEmail(fixtures.buyerEmail!);
    if (!buyerId) {
      test.skip(true, "Could not resolve buyer profile");
      return;
    }

    let lowMinSpendTemplateId: string | null = null;
    try {
      ({ lowMinSpendTemplateId } = await resolveCheckoutCouponTemplateIds());
    } catch {
      lowMinSpendTemplateId = await findActiveDiscountCouponTemplateId();
    }
    if (!lowMinSpendTemplateId) {
      test.skip(true, "Missing active discount coupon template");
      return;
    }

    const merchantListing = await findActiveMerchantListingForE2e({
      excludeSellerId: buyerId,
    });
    await reactivateListingForE2e(merchantListing.listingId);

    const rewardId = await grantUserRewardForE2e({
      userId: buyerId,
      templateId: lowMinSpendTemplateId,
    });

    await buyMerchantListingAndReachCheckout(
      page,
      merchantListing.sellerId,
      merchantListing.listingId,
    );
    await dismissBlockingOverlays(page);
    await waitForCheckoutCouponPicker(page);
    await waitForMerchantDirectCheckoutReady(page);

    const baseline = await readCheckoutSummaryAmounts(page);
    await selectCheckoutCoupon(page, rewardId);
    await assertCheckoutCouponSubsidyOnPage(page, { rewardId, baseline });
  });
});
