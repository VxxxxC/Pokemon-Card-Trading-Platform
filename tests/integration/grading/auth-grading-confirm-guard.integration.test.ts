import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  clearSessionCache,
  getBuyerClient,
  getBuyerUserId,
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
import { promoteMemberAuthOrderToShippedPassed } from "./helpers/grading-fail-fixture";

describe.skipIf(!hasBaseIntegrationEnv()).sequential(
  "auth grading confirm guard (integration)",
  () => {
    const tracked = { orderIds: [] as string[] };
    let orderId = "";
    const paymentIntentId = `pi_confirm_guard_${Date.now()}`;
    const outboundTracking = `SF-CONFIRM-${Date.now()}`;

    beforeAll(async () => {
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

      const admin = createServiceRoleClient();
      const { error: outboundError } = await admin
        .from("member_orders")
        .update({ outbound_tracking_no: outboundTracking })
        .eq("id", orderId);
      expect(outboundError).toBeNull();
    });

    afterAll(async () => {
      await wipeCouponFsmRun({
        orderIds: tracked.orderIds,
        userRewardIds: [],
        templateIds: [],
      });
      await clearSessionCache();
    });

    it("G-CONF1: buyer confirm rejected when payment is not fully_captured", async () => {
      const admin = createServiceRoleClient();
      const { error: resetError } = await admin
        .from("member_orders")
        .update({ payment_capture_status: "authorized" })
        .eq("id", orderId);
      expect(resetError).toBeNull();

      const buyerId = getBuyerUserId();
      const { error } = await getBuyerClient().rpc("rpc_confirm_buyer_received", {
        p_order_id: orderId,
        p_buyer_id: buyerId,
      });

      expect(error).not.toBeNull();
      expect(error?.message).toMatch(/款項未全額扣款|狀態不合法/);
    });
  },
);
