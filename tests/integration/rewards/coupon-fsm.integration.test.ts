import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  clearSessionCache,
  createExtraBuyerClient,
  getBuyerClient,
  getBuyerUserId,
  runAsAdmin,
  warmSession,
} from "../shared/auth-context";
import {
  backdateCouponReserve,
  finalizeStaleCouponReserve,
  findMerchantListingForIntegration,
  getMerchantOrderCouponRow,
  getUserRewardCheckoutRow,
  grantCouponForCheckout,
  invokeMarkPaid,
  invokePreparePayment,
  seedPendingMerchantOrders,
  setCouponExpiry,
} from "./helpers/checkout-fixture";
import { wipeCouponFsmRun } from "./helpers/cleanup";
import { getTemplateIdByTitle } from "./helpers/db-assert";
import { hasRewardsIntegrationEnv } from "./helpers/env";
import {
  buildAutoGrantDiscountInput,
  uniqueTitle,
} from "./helpers/fixtures";
import { publishActivity } from "./helpers/publish";

describe.skipIf(!hasRewardsIntegrationEnv()).sequential(
  "Coupon FSM integration (V1–V3)",
  () => {
    const runId = String(Date.now());
    const tracked = {
      orderIds: [] as string[],
      userRewardIds: [] as string[],
    };

    let listingId = "";
    let templateId = "";

    beforeAll(async () => {
      await warmSession("admin");
      await warmSession("buyer");

      const listing = await findMerchantListingForIntegration();
      listingId = listing.listingId;

      const title = uniqueTitle("CouponFSM", runId);
      await runAsAdmin(async () => {
        await publishActivity(buildAutoGrantDiscountInput(title));
      });

      const resolvedTemplateId = await getTemplateIdByTitle(title);
      if (!resolvedTemplateId) {
        throw new Error("Coupon FSM template not found after publish");
      }
      templateId = resolvedTemplateId;
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

    it("I-C2 rejects reserving the same coupon on a second pending order", async () => {
      const buyerId = getBuyerUserId();
      const [orderA, orderB] = await seedPendingMerchantOrders(
        buyerId,
        listingId,
        2,
      );
      tracked.orderIds.push(orderA, orderB);

      const couponId = await grantCouponForCheckout({
        userId: buyerId,
        templateId,
      });
      tracked.userRewardIds.push(couponId);

      const clientA = getBuyerClient();
      const clientB = await createExtraBuyerClient();

      const [firstResult, secondResult] = await Promise.all([
        invokePreparePayment(clientA, orderA, couponId),
        invokePreparePayment(clientB, orderB, couponId),
      ]);

      const results = [firstResult, secondResult];
      const successes = results.filter((result) => result.success);
      const failures = results.filter((result) => !result.success);

      expect(successes).toHaveLength(1);
      expect(failures).toHaveLength(1);
      expect(failures[0]?.success).toBe(false);
      if (!failures[0]?.success) {
        expect(failures[0].error).toMatch(/無法預留|已被其他訂單預留/);
      }

      const rewardRow = await getUserRewardCheckoutRow(couponId);
      expect(rewardRow?.reserved_merchant_order_id).toBeTruthy();

      const orderARow = await getMerchantOrderCouponRow(orderA);
      const orderBRow = await getMerchantOrderCouponRow(orderB);
      const boundOrderIds = [orderARow?.coupon_user_reward_id, orderBRow?.coupon_user_reward_id]
        .filter((value) => value === couponId);

      expect(boundOrderIds).toHaveLength(1);
    });

    it("I-C3 rejects mark_paid when coupon expired after prepare", async () => {
      const buyerId = getBuyerUserId();
      const [orderId] = await seedPendingMerchantOrders(buyerId, listingId, 1);
      tracked.orderIds.push(orderId);

      const couponId = await grantCouponForCheckout({
        userId: buyerId,
        templateId,
      });
      tracked.userRewardIds.push(couponId);

      const prepareResult = await invokePreparePayment(
        getBuyerClient(),
        orderId,
        couponId,
      );
      expect(prepareResult.success).toBe(true);

      const boundOrder = await getMerchantOrderCouponRow(orderId);
      expect(boundOrder?.coupon_user_reward_id).toBe(couponId);
      expect(boundOrder?.escrow_status).toBe("pending_payment");

      const expiredAt = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      await setCouponExpiry(couponId, expiredAt);

      const expiredRow = await getUserRewardCheckoutRow(couponId);
      expect(expiredRow?.calculated_expiry).toBeTruthy();
      expect(
        new Date(expiredRow?.calculated_expiry ?? 0).getTime(),
      ).toBeLessThan(Date.now() - 60 * 60 * 1000);

      const paidResult = await invokeMarkPaid(orderId);
      expect(paidResult.success).toBe(false);
      if (!paidResult.success) {
        expect(paidResult.error).toMatch(/已過期/);
      }

      const rewardRow = await getUserRewardCheckoutRow(couponId);
      expect(rewardRow?.is_used).toBe(false);
      expect(rewardRow?.used_at).toBeNull();
    });

    it("I-C4 releases stale reserve after 15 minutes and allows reuse", async () => {
      const buyerId = getBuyerUserId();
      const [orderA, orderB] = await seedPendingMerchantOrders(
        buyerId,
        listingId,
        2,
      );
      tracked.orderIds.push(orderA, orderB);

      const couponId = await grantCouponForCheckout({
        userId: buyerId,
        templateId,
      });
      tracked.userRewardIds.push(couponId);

      const prepareResult = await invokePreparePayment(
        getBuyerClient(),
        orderA,
        couponId,
      );
      expect(prepareResult.success).toBe(true);

      let rewardRow = await getUserRewardCheckoutRow(couponId);
      expect(rewardRow?.reserved_merchant_order_id).toBe(orderA);

      await backdateCouponReserve(couponId, 16);
      await finalizeStaleCouponReserve(couponId);

      rewardRow = await getUserRewardCheckoutRow(couponId);
      expect(rewardRow?.reserved_merchant_order_id).toBeNull();
      expect(rewardRow?.reserved_at).toBeNull();

      const orderARow = await getMerchantOrderCouponRow(orderA);
      expect(orderARow?.coupon_user_reward_id).toBeNull();

      const reuseResult = await invokePreparePayment(
        getBuyerClient(),
        orderB,
        couponId,
      );
      expect(reuseResult.success).toBe(true);

      rewardRow = await getUserRewardCheckoutRow(couponId);
      expect(rewardRow?.reserved_merchant_order_id).toBe(orderB);
    });
  },
);
