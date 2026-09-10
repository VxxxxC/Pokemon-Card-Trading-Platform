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
  runAsSeller,
  warmSession,
} from "../shared/auth-context";
import { hasBaseIntegrationEnv } from "../shared/env";
import { createServiceRoleClient } from "../shared/supabase-admin";
import {
  ensureMemberListingAcceptsAuthentication,
  findMemberListingForIntegration,
  seedPendingMemberAuthOrders,
} from "../rewards/helpers/checkout-fixture";
import { wipeCouponFsmRun } from "../rewards/helpers/cleanup";
import {
  authorizeMemberAuthOrderForPipeline,
  getMemberOrderSellerId,
} from "./helpers/grading-fail-fixture";

describe.skipIf(!hasBaseIntegrationEnv()).sequential(
  "auth grading happy path (integration)",
  () => {
    const tracked = { orderIds: [] as string[] };
    let orderId = "";
    let sellerId = "";
    let paymentIntentId = "";
    let buyerTotalCents = 0;
    const outboundTracking = `SF-HAPPY-${Date.now()}`;
    const grading = gradingOptionToFields(getGradingOption(DEFAULT_GRADING_OPTION_ID));

    beforeAll(async () => {
      await warmSession("admin");
      await warmSession("buyer");
      await warmSession("seller");

      const listing = await findMemberListingForIntegration();
      await ensureMemberListingAcceptsAuthentication(listing.listingId);

      const buyerId = getBuyerUserId();
      [orderId] = await seedPendingMemberAuthOrders(
        buyerId,
        listing.listingId,
        1,
      );
      tracked.orderIds.push(orderId);

      paymentIntentId = `pi_happy_${orderId.slice(0, 8)}`;
      const amounts = await authorizeMemberAuthOrderForPipeline(
        orderId,
        paymentIntentId,
      );
      buyerTotalCents = amounts.buyerTotalCents;
      sellerId = await getMemberOrderSellerId(orderId);
    });

    afterAll(async () => {
      await wipeCouponFsmRun({
        orderIds: tracked.orderIds,
        userRewardIds: [],
        templateIds: [],
      });
      await clearSessionCache();
    });

    it("G-W2: custody → inbound → intake → pass → outbound → buyer confirm", async () => {
      await runAsSeller(async () => {
        const client = getSellerClient();
        const { error } = await client.rpc("rpc_submit_inbound_tracking", {
          p_order_id: orderId,
          p_seller_id: sellerId,
          p_tracking_no: `SF-IN-${orderId.slice(0, 8)}`,
          p_courier_name: "SF Express",
        });
        expect(error).toBeNull();
      });

      await runAsAdmin(async () => {
        const client = getAdminClient();
        const { error: prepareError } = await client.rpc(
          "rpc_prepare_auth_intake_confirm",
          {
            p_order_kind: "member",
            p_order_id: orderId,
          },
        );
        expect(prepareError).toBeNull();

        const { error: finalizeIntakeError } = await client.rpc(
          "rpc_finalize_auth_intake_confirm",
          {
            p_order_kind: "member",
            p_order_id: orderId,
            p_payment_intent_id: paymentIntentId,
            p_admin_id: null,
          },
        );
        expect(finalizeIntakeError).toBeNull();
      });

      await runAsAdmin(async () => {
        const client = getAdminClient();
        const { data: prepareData, error: prepareError } = await client.rpc(
          "rpc_prepare_goods_capture",
          {
            p_order_kind: "member",
            p_order_id: orderId,
            p_notes: "integration happy path",
            p_auth_grading_company: grading.grader,
            p_auth_grading_score: grading.gradeScore,
          },
        );
        expect(prepareError).toBeNull();
        expect((prepareData as { success?: boolean })?.success).toBe(true);

        const { error: finalizePassError } = await client.rpc(
          "rpc_finalize_goods_capture",
          {
            p_order_kind: "member",
            p_order_id: orderId,
            p_payment_intent_id: paymentIntentId,
            p_captured_amount_cents: buyerTotalCents,
            p_admin_id: null,
            p_notes: "integration happy path",
            p_auth_grading_company: grading.grader,
            p_auth_grading_score: grading.gradeScore,
          },
        );
        expect(finalizePassError).toBeNull();
      });

      await runAsAdmin(async () => {
        const client = getAdminClient();
        const { error } = await client.rpc("rpc_admin_submit_grading_outbound", {
          p_order_kind: "member",
          p_order_id: orderId,
          p_tracking_no: outboundTracking,
        });
        expect(error).toBeNull();
      });

      await runAsAdmin(async () => {
        const buyerId = getBuyerUserId();
        const client = getBuyerClient();
        const { error } = await client.rpc("rpc_confirm_buyer_received", {
          p_order_id: orderId,
          p_buyer_id: buyerId,
        });
        expect(error).toBeNull();
      });

      const admin = createServiceRoleClient();
      const { data: row, error } = await admin
        .from("member_orders")
        .select(
          "escrow_status, status, auth_result, outbound_tracking_no, payment_capture_status",
        )
        .eq("id", orderId)
        .maybeSingle();

      expect(error).toBeNull();
      expect(row?.escrow_status).toBe("released");
      expect(row?.status).toBe("completed");
      expect(row?.auth_result).toBe("passed");
      expect(row?.outbound_tracking_no).toBe(outboundTracking);
      expect(row?.payment_capture_status).toBe("fully_captured");
    });
  },
);
