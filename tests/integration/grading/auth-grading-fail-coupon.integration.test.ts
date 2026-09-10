import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  clearSessionCache,
  getAdminClient,
  getBuyerClient,
  getBuyerUserId,
  runAsAdmin,
  warmSession,
} from "../shared/auth-context";
import { hasBaseIntegrationEnv } from "../shared/env";
import { createServiceRoleClient } from "../shared/supabase-admin";
import {
  ensureMemberListingAcceptsAuthentication,
  findMemberListingForIntegration,
  getUserRewardCheckoutRow,
  grantCouponForCheckout,
  invokeMemberAuthPreparePayment,
  seedPendingMemberAuthOrders,
} from "../rewards/helpers/checkout-fixture";
import { getTemplateIdByTitle } from "../rewards/helpers/db-assert";
import { wipeCouponFsmRun } from "../rewards/helpers/cleanup";
import { buildMemberAuthFreeShippingInput, uniqueTitle } from "../rewards/helpers/fixtures";
import { publishActivity } from "../rewards/helpers/publish";
import {
  promoteMemberAuthOrderToGrading,
  resetMemberAuthOrderGradingFailState,
} from "./helpers/grading-fail-fixture";

describe.skipIf(!hasBaseIntegrationEnv()).sequential(
  "auth grading fail coupon policy (integration)",
  () => {
    const runId = String(Date.now());
    const tracked = {
      orderIds: [] as string[],
      userRewardIds: [] as string[],
      templateIds: [] as string[],
    };

    let listingId = "";
    let templateTitle = "";

    beforeAll(async () => {
      await warmSession("admin");
      await warmSession("buyer");

      const listing = await findMemberListingForIntegration();
      listingId = listing.listingId;
      await ensureMemberListingAcceptsAuthentication(listingId);

      templateTitle = uniqueTitle("G-Coupon", runId);
      const templateId = await publishActivity(
        buildMemberAuthFreeShippingInput(templateTitle),
      );
      tracked.templateIds.push(templateId);
    });

    afterAll(async () => {
      await wipeCouponFsmRun(tracked);
      await clearSessionCache();
    });

    async function seedCouponAuthOrder(): Promise<{
      orderId: string;
      paymentIntentId: string;
      couponId: string;
    }> {
      const couponId = await grantCouponForCheckout({
        userId: getBuyerUserId(),
        templateId: await getTemplateIdByTitle(templateTitle),
      });
      tracked.userRewardIds.push(couponId);

      const buyerId = getBuyerUserId();
      const [orderId] = await seedPendingMemberAuthOrders(buyerId, listingId, 1);
      tracked.orderIds.push(orderId);

      const prepared = await invokeMemberAuthPreparePayment(
        getBuyerClient(),
        orderId,
        couponId,
      );
      expect(prepared.success).toBe(true);

      const paymentIntentId = `pi_coupon_${orderId.slice(0, 8)}`;
      await promoteMemberAuthOrderToGrading(orderId, paymentIntentId);

      const rewardRow = await getUserRewardCheckoutRow(couponId);
      expect(rewardRow?.is_used).toBe(true);

      return { orderId, paymentIntentId, couponId };
    }

    it("G-C1: seller fault finalize restores coupon", async () => {
      const { orderId, paymentIntentId, couponId } = await seedCouponAuthOrder();
      await resetMemberAuthOrderGradingFailState(orderId);

      await runAsAdmin(async () => {
        const client = getAdminClient();
        const { error: prepareError } = await client.rpc(
          "rpc_prepare_auth_grading_fail",
          {
            p_order_kind: "member",
            p_order_id: orderId,
            p_fault_party: "seller",
            p_reason: "coupon seller fault",
          },
        );
        expect(prepareError).toBeNull();

        const { error: finalizeError } = await client.rpc(
          "rpc_finalize_auth_grading_fail",
          {
            p_order_kind: "member",
            p_order_id: orderId,
            p_payment_intent_id: paymentIntentId,
          },
        );
        expect(finalizeError).toBeNull();
      });

      const rewardRow = await getUserRewardCheckoutRow(couponId);
      expect(rewardRow?.is_used).toBe(false);
    });

    it("G-C2: buyer fault finalize keeps coupon used", async () => {
      const { orderId, paymentIntentId, couponId } = await seedCouponAuthOrder();
      await resetMemberAuthOrderGradingFailState(orderId);

      await runAsAdmin(async () => {
        const client = getAdminClient();
        const { error: prepareError } = await client.rpc(
          "rpc_prepare_auth_grading_fail",
          {
            p_order_kind: "member",
            p_order_id: orderId,
            p_fault_party: "buyer",
            p_reason: "coupon buyer fault",
          },
        );
        expect(prepareError).toBeNull();

        const { error: finalizeError } = await client.rpc(
          "rpc_finalize_auth_grading_fail",
          {
            p_order_kind: "member",
            p_order_id: orderId,
            p_payment_intent_id: paymentIntentId,
          },
        );
        expect(finalizeError).toBeNull();
      });

      const rewardRow = await getUserRewardCheckoutRow(couponId);
      expect(rewardRow?.is_used).toBe(true);

      const admin = createServiceRoleClient();
      const { data: orderRow } = await admin
        .from("member_orders")
        .select("coupon_user_reward_id")
        .eq("id", orderId)
        .maybeSingle();
      expect(orderRow?.coupon_user_reward_id).not.toBeNull();
    });
  },
);
