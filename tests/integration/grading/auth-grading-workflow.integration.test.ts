import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  clearSessionCache,
  getAdminClient,
  getBuyerUserId,
  runAsAdmin,
  warmSession,
} from "../shared/auth-context";
import { hasBaseIntegrationEnv } from "../shared/env";
import {
  ensureMemberListingAcceptsAuthentication,
  findMemberListingForIntegration,
  seedPendingMemberAuthOrders,
} from "../rewards/helpers/checkout-fixture";
import { wipeCouponFsmRun } from "../rewards/helpers/cleanup";
import { createServiceRoleClient } from "../shared/supabase-admin";
import { promoteMemberAuthOrderToShippedPassed } from "./helpers/grading-fail-fixture";

type OutboundRpcResult = {
  order?: {
    outbound_tracking_no?: string | null;
  };
};

describe.skipIf(!hasBaseIntegrationEnv()).sequential(
  "auth grading workflow (integration)",
  () => {
    const tracked = { orderIds: [] as string[] };
    let orderId = "";
    const paymentIntentId = `pi_grading_w1_${Date.now()}`;
    const trackingNo = `SF-OUTBOUND-${Date.now()}`;

    beforeAll(async () => {
      await warmSession("admin");
      await warmSession("buyer");

      const listing = await findMemberListingForIntegration();
      await ensureMemberListingAcceptsAuthentication(listing.listingId);

      const buyerId = getBuyerUserId();
      [orderId] = await seedPendingMemberAuthOrders(
        buyerId,
        listing.listingId,
        1,
      );
      tracked.orderIds.push(orderId);

      await promoteMemberAuthOrderToShippedPassed(orderId, paymentIntentId);
    });

    afterAll(async () => {
      await wipeCouponFsmRun({
        orderIds: tracked.orderIds,
        userRewardIds: [],
        templateIds: [],
      });
      await clearSessionCache();
    });

    it("G-W1: admin submit outbound updates tracking without security block", async () => {
      const admin = createServiceRoleClient();
      const { data: beforeRow, error: beforeError } = await admin
        .from("member_orders")
        .select(
          "use_authentication, status, escrow_status, auth_result, payment_capture_status, outbound_tracking_no",
        )
        .eq("id", orderId)
        .maybeSingle();

      expect(beforeError).toBeNull();
      expect(beforeRow?.use_authentication).toBe(true);
      expect(beforeRow?.status).toBe("pending");
      expect(beforeRow?.escrow_status).toBe("shipped");
      expect(beforeRow?.auth_result).toBe("passed");
      expect(beforeRow?.payment_capture_status).toBe("fully_captured");

      const result = await runAsAdmin(async () => {
        const client = getAdminClient();
        const { data, error } = await client.rpc(
          "rpc_admin_submit_grading_outbound",
          {
            p_order_kind: "member",
            p_order_id: orderId,
            p_tracking_no: trackingNo,
          },
        );

        if (error) {
          throw new Error(error.message);
        }

        return data as OutboundRpcResult;
      });

      expect(result.order?.outbound_tracking_no).toBe(trackingNo);

      const { data: afterRow, error: afterError } = await admin
        .from("member_orders")
        .select("outbound_tracking_no")
        .eq("id", orderId)
        .maybeSingle();

      expect(afterError).toBeNull();
      expect(afterRow?.outbound_tracking_no).toBe(trackingNo);
    });
  },
);
