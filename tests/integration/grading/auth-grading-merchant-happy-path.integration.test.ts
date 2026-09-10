import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  gradingOptionToFields,
  DEFAULT_GRADING_OPTION_ID,
  getGradingOption,
} from "@/lib/grading/options";
import {
  clearSessionCache,
  getAdminClient,
  getBuyerClient,
  getBuyerUserId,
  getSellerClient,
  runAsAdmin,
  runAsBuyer,
  runAsSeller,
  warmSession,
} from "../shared/auth-context";
import { createServiceRoleClient } from "../shared/supabase-admin";
import { seedPendingMerchantOrders } from "../rewards/helpers/checkout-fixture";
import { wipeCouponFsmRun } from "../rewards/helpers/cleanup";
import {
  getMerchantGradingContext,
  hasMerchantGradingEnvVars,
  merchantIt,
  requireMerchantGradingEnvReady,
} from "./helpers/grading-merchant-env";
import {
  authorizeMerchantAuthOrderForPipeline,
  finalizeMerchantAuthOrderIntake,
  getMerchantOrderMerchantId,
  submitMerchantAuthInboundForPipeline,
} from "./helpers/grading-merchant-fixture";

describe.sequential(
  "auth grading merchant happy path (integration)",
  () => {
    const tracked = { orderIds: [] as string[] };
    let orderId = "";
    let merchantId = "";
    let paymentIntentId = "";
    let buyerTotalCents = 0;
    const outboundTracking = `SF-MHAPPY-${Date.now()}`;
    const grading = gradingOptionToFields(getGradingOption(DEFAULT_GRADING_OPTION_ID));

    beforeAll(async () => {
      await warmSession("admin");
      await warmSession("buyer");
      await warmSession("seller");
      await requireMerchantGradingEnvReady();

      const ctx = getMerchantGradingContext();
      if (!ctx) {
        return;
      }

      const { listingId, sellerId } = ctx;
      const buyerId = getBuyerUserId();
      [orderId] = await seedPendingMerchantOrders(buyerId, listingId, 1);
      tracked.orderIds.push(orderId);

      paymentIntentId = `pi_mhappy_${orderId.slice(0, 8)}`;

      await runAsBuyer(async () => {
        const amounts = await authorizeMerchantAuthOrderForPipeline(
          getBuyerClient(),
          orderId,
          paymentIntentId,
        );
        buyerTotalCents = amounts.buyerTotalCents;
      });

      merchantId = await getMerchantOrderMerchantId(orderId);
      expect(merchantId).toBe(sellerId);
    });

    afterAll(async () => {
      await wipeCouponFsmRun({
        orderIds: tracked.orderIds,
        userRewardIds: [],
        templateIds: [],
      });
      await clearSessionCache();
    });

    merchantIt("G-W2M: payment_held → inbound → intake → pass → outbound → buyer confirm", async () => {
      const inbound = {
        trackingNo: `SF-IN-M-${orderId.slice(0, 8)}`,
        courierName: "SF Express",
      };

      await runAsSeller(async () => {
        await submitMerchantAuthInboundForPipeline(
          orderId,
          merchantId,
          inbound,
          getSellerClient(),
        );
      });

      await runAsAdmin(async () => {
        await finalizeMerchantAuthOrderIntake({
          orderId,
          paymentIntentId,
          adminClient: getAdminClient(),
        });
      });

      await runAsAdmin(async () => {
        const client = getAdminClient();
        const { data: prepareData, error: prepareError } = await client.rpc(
          "rpc_prepare_goods_capture",
          {
            p_order_kind: "merchant",
            p_order_id: orderId,
            p_notes: "integration merchant happy path",
            p_auth_grading_company: grading.grader,
            p_auth_grading_score: grading.gradeScore,
          },
        );
        expect(prepareError).toBeNull();
        expect((prepareData as { success?: boolean })?.success).toBe(true);

        const { error: finalizePassError } = await client.rpc(
          "rpc_finalize_goods_capture",
          {
            p_order_kind: "merchant",
            p_order_id: orderId,
            p_payment_intent_id: paymentIntentId,
            p_captured_amount_cents: buyerTotalCents,
            p_admin_id: null,
            p_notes: "integration merchant happy path",
            p_auth_grading_company: grading.grader,
            p_auth_grading_score: grading.gradeScore,
          },
        );
        expect(finalizePassError).toBeNull();
      });

      await runAsAdmin(async () => {
        const client = getAdminClient();
        const { error } = await client.rpc("rpc_admin_submit_grading_outbound", {
          p_order_kind: "merchant",
          p_order_id: orderId,
          p_tracking_no: outboundTracking,
        });
        expect(error).toBeNull();
      });

      await runAsBuyer(async () => {
        const client = getBuyerClient();
        const { error } = await client.rpc("rpc_confirm_merchant_buyer_receipt", {
          p_order_id: orderId,
        });
        expect(error).toBeNull();
      });

      const admin = createServiceRoleClient();
      const { data: row, error } = await admin
        .from("merchant_orders")
        .select(
          "escrow_status, auth_result, outbound_tracking_no, payment_capture_status, buyer_confirmed_at, payout_status",
        )
        .eq("id", orderId)
        .maybeSingle();

      expect(error).toBeNull();
      expect(row?.escrow_status).toBe("authenticated");
      expect(row?.auth_result).toBe("passed");
      expect(row?.outbound_tracking_no).toBe(outboundTracking);
      expect(row?.payment_capture_status).toBe("fully_captured");
      expect(row?.buyer_confirmed_at).not.toBeNull();
      expect(row?.payout_status).toBe("held");
    });
  },
);
