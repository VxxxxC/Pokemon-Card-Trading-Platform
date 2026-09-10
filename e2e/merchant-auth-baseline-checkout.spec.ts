import { test, expect } from "@playwright/test";
import { getProfileIdByEmail } from "./fixtures/supabase-admin";
import {
  getMerchantProductDetailFixtures,
  hasBuyerAuthFixtures,
} from "./fixtures/test-data";
import {
  buyMerchantListingWithAuthAndReachCheckout,
  completeMerchantAuthCheckout,
  findActiveMerchantListingForE2e,
  getMerchantOrderCouponSnapshot,
  reactivateListingForE2e,
  setListingAuthenticationForE2e,
} from "./helpers/platform-rewards";

test.use({ viewport: { width: 1280, height: 900 } });
test.setTimeout(300_000);

test.describe("C8 merchant_auth baseline checkout (no coupon)", () => {
  test("C8: merchant_auth checkout without coupon authorizes payment", async (
    { page },
    testInfo,
  ) => {
    test.skip(testInfo.project.name !== "buyer", "Buyer auth required");
    test.skip(!hasBuyerAuthFixtures(), "Missing buyer credentials");

    const fixtures = getMerchantProductDetailFixtures();
    const buyerId = await getProfileIdByEmail(fixtures.buyerEmail!);
    const merchantListing = await findActiveMerchantListingForE2e({
      excludeSellerId: buyerId!,
    });

    await reactivateListingForE2e(merchantListing.listingId);
    await setListingAuthenticationForE2e(merchantListing.listingId, true);

    const authOrderId = await buyMerchantListingWithAuthAndReachCheckout(
      page,
      merchantListing.sellerId,
      merchantListing.listingId,
    );

    await completeMerchantAuthCheckout(page);

    const snapshot = await getMerchantOrderCouponSnapshot(authOrderId);
    expect(snapshot).toBeTruthy();
    expect(snapshot!.requires_authentication).toBe(true);
    expect(snapshot!.payment_capture_status).toBe("authorized");
    expect(snapshot!.coupon_user_reward_id).toBeNull();
    expect(snapshot!.escrow_status).toBe("payment_held");
  });
});
