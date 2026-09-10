import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  clearSessionCache,
  getAdminClient,
  getBuyerClient,
  getBuyerUserId,
  getSellerClient,
  runAsAdmin,
  warmSession,
} from "../shared/auth-context";
import { createServiceRoleClient } from "../shared/supabase-admin";
import {
  getUserRewardCheckoutRow,
  grantCouponForCheckout,
} from "../rewards/helpers/checkout-fixture";
import { getTemplateIdByTitle } from "../rewards/helpers/db-assert";
import { wipeCouponFsmRun } from "../rewards/helpers/cleanup";
import { buildAuthFreeShippingInput, uniqueTitle } from "../rewards/helpers/fixtures";
import { publishActivity } from "../rewards/helpers/publish";
import {
  getMerchantGradingContext,
  hasMerchantGradingEnvVars,
  merchantIt,
  requireMerchantGradingEnvReady,
} from "./helpers/grading-merchant-env";
import { seedMerchantAuthOrderAtAuthenticatingWithCoupon } from "./helpers/grading-merchant-fixture";

describe.sequential(
  "auth grading merchant fail coupon policy (integration)",
  () => {
    const runId = String(Date.now());
    const tracked = {
      orderIds: [] as string[],
      userRewardIds: [] as string[],
      templateIds: [] as string[],
    };

    let listingId = "";
    let sellerId = "";
    let templateTitle = "";

    beforeAll(async () => {
      await warmSession("admin");
      await warmSession("buyer");
      await warmSession("seller");
      await requireMerchantGradingEnvReady();
      const ctx = getMerchantGradingContext();
      if (!ctx) {
        return;
      }
      listingId = ctx.listingId;
      sellerId = ctx.sellerId;

      templateTitle = uniqueTitle("G-CouponM", runId);
      const templateId = await publishActivity(
        buildAuthFreeShippingInput(templateTitle),
      );
      tracked.templateIds.push(templateId);
    });

    afterAll(async () => {
      await wipeCouponFsmRun(tracked);
      await clearSessionCache();
    });

    async function seedCouponAuthOrder(suffix: string): Promise<{
      orderId: string;
      paymentIntentId: string;
      couponId: string;
    }> {
      const couponId = await grantCouponForCheckout({
        userId: getBuyerUserId(),
        templateId: await getTemplateIdByTitle(templateTitle),
      });
      tracked.userRewardIds.push(couponId);

      const seeded = await seedMerchantAuthOrderAtAuthenticatingWithCoupon({
        listingId,
        buyerId: getBuyerUserId(),
        sellerId,
        suffix,
        couponId,
        buyerClient: getBuyerClient(),
        sellerClient: getSellerClient(),
        adminClient: getAdminClient(),
      });
      tracked.orderIds.push(seeded.orderId);

      const rewardRow = await getUserRewardCheckoutRow(couponId);
      expect(rewardRow?.is_used).toBe(true);

      return {
        orderId: seeded.orderId,
        paymentIntentId: seeded.paymentIntentId,
        couponId,
      };
    }

    merchantIt("G-C1M: seller fault finalize restores coupon", async () => {
      const { orderId, paymentIntentId, couponId } =
        await seedCouponAuthOrder("c1m");

      await runAsAdmin(async () => {
        const client = getAdminClient();
        const { error: prepareError } = await client.rpc(
          "rpc_prepare_auth_grading_fail",
          {
            p_order_kind: "merchant",
            p_order_id: orderId,
            p_fault_party: "seller",
            p_reason: "coupon seller fault",
          },
        );
        expect(prepareError).toBeNull();

        const { error: finalizeError } = await client.rpc(
          "rpc_finalize_auth_grading_fail",
          {
            p_order_kind: "merchant",
            p_order_id: orderId,
            p_payment_intent_id: paymentIntentId,
          },
        );
        expect(finalizeError).toBeNull();
      });

      const rewardRow = await getUserRewardCheckoutRow(couponId);
      expect(rewardRow?.is_used).toBe(false);
    });

    merchantIt("G-C2M: buyer fault finalize keeps coupon used", async () => {
      const { orderId, paymentIntentId, couponId } =
        await seedCouponAuthOrder("c2m");

      await runAsAdmin(async () => {
        const client = getAdminClient();
        const { error: prepareError } = await client.rpc(
          "rpc_prepare_auth_grading_fail",
          {
            p_order_kind: "merchant",
            p_order_id: orderId,
            p_fault_party: "buyer",
            p_reason: "coupon buyer fault",
          },
        );
        expect(prepareError).toBeNull();

        const { error: finalizeError } = await client.rpc(
          "rpc_finalize_auth_grading_fail",
          {
            p_order_kind: "merchant",
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
        .from("merchant_orders")
        .select("coupon_user_reward_id")
        .eq("id", orderId)
        .maybeSingle();
      expect(orderRow?.coupon_user_reward_id).not.toBeNull();
    });
  },
);
