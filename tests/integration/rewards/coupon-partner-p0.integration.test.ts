import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  clearSessionCache,
  getBuyerClient,
  getBuyerUserId,
  runAsAdmin,
  warmSession,
} from "../shared/auth-context";
import {
  backdateMerchantOrderCreatedAt,
  ensureMerchantListingAcceptsAuthentication,
  finalizeMerchantPendingPaymentExpiry,
  findMerchantListingForIntegration,
  getMerchantOrderCouponRow,
  getUserRewardCheckoutRow,
  grantCouponForCheckout,
  invokePreparePayment,
  markCouponUsedForOrder,
  releaseMerchantOrderCoupon,
  restoreMerchantOrderCouponOnVoid,
  seedPendingMerchantOrders,
  setBuyerProfileComplete,
} from "./helpers/checkout-fixture";
import { wipeCouponFsmRun } from "./helpers/cleanup";
import {
  findLatestUserRewardForTemplate,
  getTemplateIdByTitle,
  getUserRewardGrantRow,
  invokeAutoGrantForUser,
} from "./helpers/db-assert";
import { hasRewardsIntegrationEnv } from "./helpers/env";
import {
  buildAutoGrantDiscountInput,
  buildAutoGrantProfileCompleteInput,
  uniqueTitle,
} from "./helpers/fixtures";
import { publishActivity } from "./helpers/publish";

function assertCouponReleased(params: {
  couponId: string;
  orderId: string;
}): Promise<void> {
  return (async () => {
    const rewardRow = await getUserRewardCheckoutRow(params.couponId);
    expect(rewardRow?.is_used).toBe(false);
    expect(rewardRow?.used_at).toBeNull();
    expect(rewardRow?.reserved_merchant_order_id).toBeNull();

    const orderRow = await getMerchantOrderCouponRow(params.orderId);
    expect(orderRow?.coupon_user_reward_id).toBeNull();
  })();
}

describe.skipIf(!hasRewardsIntegrationEnv()).sequential(
  "Partner P0 integration (coupon release & auto-grant)",
  () => {
    const runId = String(Date.now());
    const tracked = {
      orderIds: [] as string[],
      userRewardIds: [] as string[],
      templateIds: [] as string[],
    };

    let listingId = "";
    let discountTemplateId = "";

    beforeAll(async () => {
      await warmSession("admin");
      await warmSession("buyer");

      const listing = await findMerchantListingForIntegration();
      listingId = listing.listingId;
      await ensureMerchantListingAcceptsAuthentication(listingId);

      const discountTitle = uniqueTitle("PartnerP0Discount", runId);
      await runAsAdmin(async () => {
        await publishActivity(buildAutoGrantDiscountInput(discountTitle));
      });

      const resolvedDiscountId = await getTemplateIdByTitle(discountTitle);
      if (!resolvedDiscountId) {
        throw new Error("Partner P0 discount template not found after publish");
      }
      discountTemplateId = resolvedDiscountId;
      tracked.templateIds.push(resolvedDiscountId);
    });

    afterEach(async () => {
      await wipeCouponFsmRun({
        orderIds: [...tracked.orderIds],
        userRewardIds: [...tracked.userRewardIds],
      });
      tracked.orderIds = [];
      tracked.userRewardIds = [];
    });

    afterAll(async () => {
      await clearSessionCache();
    });

    it("I-P0-1 releases coupon when merchant order coupon is released (cancel PI path)", async () => {
      const buyerId = getBuyerUserId();
      const [orderId] = await seedPendingMerchantOrders(buyerId, listingId, 1);
      tracked.orderIds.push(orderId);

      const couponId = await grantCouponForCheckout({
        userId: buyerId,
        templateId: discountTemplateId,
      });
      tracked.userRewardIds.push(couponId);

      const client = getBuyerClient();
      const prepared = await invokePreparePayment(client, orderId, couponId);
      expect(prepared.success).toBe(true);

      const reserved = await getUserRewardCheckoutRow(couponId);
      expect(reserved?.reserved_merchant_order_id).toBe(orderId);

      await releaseMerchantOrderCoupon(orderId);
      await assertCouponReleased({ couponId, orderId });
    });

    it("I-P0-2 releases coupon when pending_payment order expires after 48h", async () => {
      const buyerId = getBuyerUserId();
      const [orderId] = await seedPendingMerchantOrders(buyerId, listingId, 1);
      tracked.orderIds.push(orderId);

      const couponId = await grantCouponForCheckout({
        userId: buyerId,
        templateId: discountTemplateId,
      });
      tracked.userRewardIds.push(couponId);

      const client = getBuyerClient();
      const prepared = await invokePreparePayment(client, orderId, couponId);
      expect(prepared.success).toBe(true);

      await backdateMerchantOrderCreatedAt(orderId, 49);
      await finalizeMerchantPendingPaymentExpiry(orderId);
      await assertCouponReleased({ couponId, orderId });
    });

    it("I-P0-3 restores coupon when merchant auth order is voided after grading fail", async () => {
      const buyerId = getBuyerUserId();
      const [orderId] = await seedPendingMerchantOrders(buyerId, listingId, 1);
      tracked.orderIds.push(orderId);

      const couponId = await grantCouponForCheckout({
        userId: buyerId,
        templateId: discountTemplateId,
      });
      tracked.userRewardIds.push(couponId);

      const client = getBuyerClient();
      const prepared = await invokePreparePayment(client, orderId, couponId, {
        p_use_auth: true,
        p_shipping_method: "sf",
        p_sf_locker_code: "VITEST01",
        p_sf_address: "Vitest SF locker",
      });
      expect(prepared.success).toBe(true);

      await markCouponUsedForOrder({ userRewardId: couponId, orderId });

      const usedRow = await getUserRewardCheckoutRow(couponId);
      expect(usedRow?.is_used).toBe(true);

      await restoreMerchantOrderCouponOnVoid(orderId);
      await assertCouponReleased({ couponId, orderId });

      const rePrepare = await invokePreparePayment(client, orderId, couponId, {
        p_use_auth: true,
        p_shipping_method: "sf",
        p_sf_locker_code: "VITEST02",
        p_sf_address: "Vitest SF locker retry",
      });
      expect(rePrepare.success).toBe(true);
    });

    it("I-P0-5 auto-grants coupon on profile_complete event_once", async () => {
      const buyerId = getBuyerUserId();
      const title = uniqueTitle("PartnerP0ProfileComplete", runId);

      await runAsAdmin(async () => {
        await publishActivity(buildAutoGrantProfileCompleteInput(title));
      });

      const templateId = await getTemplateIdByTitle(title);
      if (!templateId) {
        throw new Error("Partner P0 profile_complete template not found");
      }
      tracked.templateIds.push(templateId);

      await setBuyerProfileComplete(buyerId);
      await invokeAutoGrantForUser(buyerId);

      const userRewardId = await findLatestUserRewardForTemplate({
        userId: buyerId,
        templateId,
      });
      expect(userRewardId).toBeTruthy();
      if (!userRewardId) {
        return;
      }

      tracked.userRewardIds.push(userRewardId);

      const rewardRow = await getUserRewardGrantRow(userRewardId);
      expect(rewardRow?.grant_dedup_key).toBe("lifetime");
      expect(rewardRow?.is_used).toBe(false);
    });
  },
);
