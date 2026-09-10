import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  clearSessionCache,
  getAdminClient,
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
  promoteMemberAuthOrderToGrading,
} from "./helpers/grading-fail-fixture";

describe.skipIf(!hasBaseIntegrationEnv()).sequential(
  "auth grading cancel (integration)",
  () => {
    const tracked = { orderIds: [] as string[] };
    const paymentIntentId = `pi_cancel_${Date.now()}`;

    beforeAll(async () => {
      await warmSession("admin");
      await warmSession("buyer");
      await warmSession("seller");
    });

    afterAll(async () => {
      await wipeCouponFsmRun({
        orderIds: tracked.orderIds,
        userRewardIds: [],
        templateIds: [],
      });
      await clearSessionCache();
    });

    it("G-CAN1: seller can cancel authorized custody order before intake", async () => {
      const listing = await findMemberListingForIntegration();
      await ensureMemberListingAcceptsAuthentication(listing.listingId);
      const buyerId = getBuyerUserId();
      const [orderId] = await seedPendingMemberAuthOrders(
        buyerId,
        listing.listingId,
        1,
      );
      tracked.orderIds.push(orderId);

      await authorizeMemberAuthOrderForPipeline(orderId, paymentIntentId);
      const sellerId = await getMemberOrderSellerId(orderId);

      const admin = createServiceRoleClient();
      const { data: beforeRow } = await admin
        .from("member_orders")
        .select("listing_id, escrow_status, platform_received_at, payment_capture_status")
        .eq("id", orderId)
        .maybeSingle();

      expect(beforeRow?.escrow_status).toBe("custody");
      expect(beforeRow?.platform_received_at).toBeNull();
      expect(beforeRow?.payment_capture_status).toBe("authorized");

      await runAsSeller(async () => {
        const client = getSellerClient();
        const { error } = await client.rpc("rpc_cancel_member_order", {
          p_order_id: orderId,
          p_user_id: sellerId,
        });
        expect(error).toBeNull();
      });

      const { data: afterRow } = await admin
        .from("member_orders")
        .select("status, payment_capture_status, escrow_status")
        .eq("id", orderId)
        .maybeSingle();

      expect(afterRow?.status).toBe("cancelled");
      expect(afterRow?.payment_capture_status).toBe("voided");
      expect(afterRow?.escrow_status).toBe("cancelled");

      const { data: listingRow } = await admin
        .from("listings")
        .select("status")
        .eq("id", beforeRow?.listing_id ?? "")
        .maybeSingle();
      expect(listingRow?.status).toBe("active");
    });

    it("G-CAN2: cancel rejected while order is in grading", async () => {
      const listing = await findMemberListingForIntegration();
      await ensureMemberListingAcceptsAuthentication(listing.listingId);
      const buyerId = getBuyerUserId();
      const [orderId] = await seedPendingMemberAuthOrders(
        buyerId,
        listing.listingId,
        1,
      );
      tracked.orderIds.push(orderId);

      await promoteMemberAuthOrderToGrading(orderId, `${paymentIntentId}_g2`);
      const sellerId = await getMemberOrderSellerId(orderId);

      await runAsSeller(async () => {
        const client = getSellerClient();
        const { error } = await client.rpc("rpc_cancel_member_order", {
          p_order_id: orderId,
          p_user_id: sellerId,
        });
        expect(error).not.toBeNull();
        expect(error?.message).toContain("鑑定期間不可取消");
      });
    });

    it("G-CAN3: cancel rejected after admin intake (platform_received_at set)", async () => {
      const listing = await findMemberListingForIntegration();
      await ensureMemberListingAcceptsAuthentication(listing.listingId);
      const buyerId = getBuyerUserId();
      const [orderId] = await seedPendingMemberAuthOrders(
        buyerId,
        listing.listingId,
        1,
      );
      tracked.orderIds.push(orderId);

      const piId = `${paymentIntentId}_g3`;
      await authorizeMemberAuthOrderForPipeline(orderId, piId);
      const sellerId = await getMemberOrderSellerId(orderId);

      await runAsSeller(async () => {
        const client = getSellerClient();
        const { error } = await client.rpc("rpc_submit_inbound_tracking", {
          p_order_id: orderId,
          p_seller_id: sellerId,
          p_tracking_no: `SF-CAN3-${orderId.slice(0, 8)}`,
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

        const { error: finalizeError } = await client.rpc(
          "rpc_finalize_auth_intake_confirm",
          {
            p_order_kind: "member",
            p_order_id: orderId,
            p_payment_intent_id: piId,
            p_admin_id: null,
          },
        );
        expect(finalizeError).toBeNull();
      });

      const admin = createServiceRoleClient();
      const { data: midRow } = await admin
        .from("member_orders")
        .select("escrow_status, platform_received_at")
        .eq("id", orderId)
        .maybeSingle();
      expect(midRow?.escrow_status).toBe("grading");
      expect(midRow?.platform_received_at).not.toBeNull();

      await runAsSeller(async () => {
        const client = getSellerClient();
        const { error } = await client.rpc("rpc_cancel_member_order", {
          p_order_id: orderId,
          p_user_id: sellerId,
        });
        expect(error).not.toBeNull();
        expect(error?.message).toContain("鑑定期間不可取消");
      });
    });
  },
);
