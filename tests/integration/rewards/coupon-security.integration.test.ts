import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  clearSessionCache,
  getAdminClient,
  getAdminUserId,
  getBuyerClient,
  getBuyerUserId,
  runAsAdmin,
  warmSession,
} from "../shared/auth-context";
import { createServiceRoleClient } from "../shared/supabase-admin";
import {
  attemptDirectCouponTamper,
  findMerchantListingForIntegration,
  getMerchantOrderCouponRow,
  getUserRewardCheckoutRow,
  grantCouponForCheckout,
  invokeGetRewardCouponCenter,
  invokePreparePayment,
  invokeReleaseCoupon,
  seedPendingMerchantOrders,
} from "./helpers/checkout-fixture";
import { wipeCouponFsmRun } from "./helpers/cleanup";
import { getTemplateIdByTitle } from "./helpers/db-assert";
import { hasRewardsIntegrationEnv } from "./helpers/env";
import { buildAutoGrantDiscountInput, uniqueTitle } from "./helpers/fixtures";
import { publishActivity } from "./helpers/publish";

describe.skipIf(!hasRewardsIntegrationEnv()).sequential(
  "Coupon security integration (R-01..R-03)",
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

      const title = uniqueTitle("CouponSecurity", runId);
      await runAsAdmin(async () => {
        await publishActivity(buildAutoGrantDiscountInput(title));
      });

      const resolvedTemplateId = await getTemplateIdByTitle(title);
      if (!resolvedTemplateId) {
        throw new Error("Coupon security template not found after publish");
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

    it("I-S1 blocks direct user_rewards tampering of coupon state columns", async () => {
      const buyerId = getBuyerUserId();
      const couponId = await grantCouponForCheckout({
        userId: buyerId,
        templateId,
      });
      tracked.userRewardIds.push(couponId);

      const admin = createServiceRoleClient();
      const { error: markUsedError } = await admin
        .from("user_rewards")
        .update({ is_used: true, used_at: new Date().toISOString() })
        .eq("id", couponId);

      expect(markUsedError).toBeNull();

      const tamperResult = await attemptDirectCouponTamper(
        getBuyerClient(),
        couponId,
        {
          is_used: false,
          calculated_expiry: new Date(Date.now() + 86400000).toISOString(),
        },
      );

      expect(tamperResult.success).toBe(false);
      if (!tamperResult.success) {
        expect(tamperResult.error.toLowerCase()).toMatch(
          /permission|privilege|denied|column/,
        );
      }

      const row = await getUserRewardCheckoutRow(couponId);
      expect(row?.is_used).toBe(true);
    });

    it("I-S2 blocks cross-user get_reward_coupon_center IDOR", async () => {
      const adminUserId = getAdminUserId();
      const buyerId = getBuyerUserId();
      expect(adminUserId).not.toBe(buyerId);

      const result = await invokeGetRewardCouponCenter(
        getBuyerClient(),
        adminUserId,
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toMatch(/無權/);
      }
    });

    it("I-S3 blocks authenticated fn_release_merchant_order_coupon on foreign orders", async () => {
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

      const releaseResult = await invokeReleaseCoupon(getAdminClient(), orderId);
      expect(releaseResult.success).toBe(false);
      if (!releaseResult.success) {
        expect(releaseResult.error.toLowerCase()).toMatch(
          /permission|denied|execute|privilege/,
        );
      }

      const rewardRow = await getUserRewardCheckoutRow(couponId);
      expect(rewardRow?.reserved_merchant_order_id).toBe(orderId);

      const orderRow = await getMerchantOrderCouponRow(orderId);
      expect(orderRow?.coupon_user_reward_id).toBe(couponId);
    });
  },
);
