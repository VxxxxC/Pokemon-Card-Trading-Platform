import { afterAll, beforeAll, describe, expect } from "vitest";
import {
  clearSessionCache,
  getBuyerClient,
  getBuyerUserId,
  runAsBuyer,
  warmSession,
} from "../shared/auth-context";
import { wipeCouponFsmRun } from "../rewards/helpers/cleanup";
import { createServiceRoleClient } from "../shared/supabase-admin";
import {
  getMerchantGradingContext,
  hasMerchantGradingEnvVars,
  merchantIt,
  requireMerchantGradingEnvReady,
} from "./helpers/grading-merchant-env";

describe.sequential(
  "auth grading merchant confirm guard (integration)",
  () => {
    const tracked = { orderIds: [] as string[] };
    let orderId = "";

    beforeAll(async () => {
      await warmSession("buyer");
      await requireMerchantGradingEnvReady();

      const ctx = getMerchantGradingContext();
      if (!ctx) {
        return;
      }

      const buyerId = getBuyerUserId();
      const admin = createServiceRoleClient();

      const { data: seededOrderId, error } = await admin.rpc(
        "rpc_e2e_seed_merchant_auth_confirm_guard_order",
        {
          p_listing_id: ctx.listingId,
          p_buyer_id: buyerId,
          p_payment_intent_suffix: `conf1m-${Date.now()}`,
        },
      );

      if (error || !seededOrderId) {
        throw new Error(
          `[G-CONF1M setup] seed failed: ${error?.message ?? "missing order id"}`,
        );
      }

      orderId = seededOrderId;
      tracked.orderIds.push(orderId);
    });

    afterAll(async () => {
      await wipeCouponFsmRun({
        orderIds: tracked.orderIds,
        userRewardIds: [],
        templateIds: [],
      });
      await clearSessionCache();
    });

    merchantIt("G-CONF1M: merchant buyer confirm rejected when payment is not fully_captured", async () => {
      await runAsBuyer(async () => {
        const { error } = await getBuyerClient().rpc(
          "rpc_confirm_merchant_buyer_receipt",
          { p_order_id: orderId },
        );

        expect(error).not.toBeNull();
        expect(error?.message).toMatch(
          /款項未全額扣款|尚未通過鑑定|尚未出庫/,
        );
      });
    });
  },
);
