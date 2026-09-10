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
import {
  getMemberOrderGradingFailRow,
  getSellerReceivableForOrder,
  promoteMemberAuthOrderToGrading,
  resetMemberAuthOrderGradingFailState,
} from "./helpers/grading-fail-fixture";

describe.skipIf(!hasBaseIntegrationEnv()).sequential(
  "auth grading fail carrier liability (integration)",
  () => {
    const tracked = { orderIds: [] as string[] };

    function paymentIntentFor(orderId: string): string {
      return `pi_carrier_${orderId.slice(0, 8)}`;
    }

    beforeAll(async () => {
      await warmSession("admin");
      await warmSession("buyer");
    });

    afterAll(async () => {
      await wipeCouponFsmRun({
        orderIds: tracked.orderIds,
        userRewardIds: [],
        templateIds: [],
      });
      await clearSessionCache();
    });

    async function seedGradingOrder(): Promise<string> {
      const listing = await findMemberListingForIntegration();
      await ensureMemberListingAcceptsAuthentication(listing.listingId);

      const buyerId = getBuyerUserId();
      const [orderId] = await seedPendingMemberAuthOrders(
        buyerId,
        listing.listingId,
        1,
      );
      tracked.orderIds.push(orderId);
      await promoteMemberAuthOrderToGrading(orderId, paymentIntentFor(orderId));
      return orderId;
    }

    it("G-BF8: prepare carrier without liability is rejected", async () => {
      const orderId = await seedGradingOrder();
      await resetMemberAuthOrderGradingFailState(orderId);

      await runAsAdmin(async () => {
        const client = getAdminClient();
        const { error } = await client.rpc("rpc_prepare_auth_grading_fail", {
          p_order_kind: "member",
          p_order_id: orderId,
          p_fault_party: "carrier",
          p_reason: "missing liability",
        });
        expect(error).not.toBeNull();
      });
    });

    it("G-BF6: carrier seller liability creates seller receivable", async () => {
      const orderId = await seedGradingOrder();
      const paymentIntentId = paymentIntentFor(orderId);
      await resetMemberAuthOrderGradingFailState(orderId);

      await runAsAdmin(async () => {
        const client = getAdminClient();
        const { error: prepareError } = await client.rpc(
          "rpc_prepare_auth_grading_fail",
          {
            p_order_kind: "member",
            p_order_id: orderId,
            p_fault_party: "carrier",
            p_reason: "carrier seller fault",
            p_carrier_liability_party: "seller",
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

      const row = await getMemberOrderGradingFailRow(orderId);
      expect(row?.auth_result).toBe("failed");
      expect(row?.fault_party).toBe("carrier");

      const receivable = await getSellerReceivableForOrder(orderId);
      expect(receivable).not.toBeNull();
      expect(Number(receivable?.amount_hkd ?? 0)).toBeGreaterThan(0);
    });

    it("G-BF7: carrier platform liability has no seller receivable", async () => {
      const orderId = await seedGradingOrder();
      const paymentIntentId = paymentIntentFor(orderId);
      await resetMemberAuthOrderGradingFailState(orderId);

      await runAsAdmin(async () => {
        const client = getAdminClient();
        const { error: prepareError } = await client.rpc(
          "rpc_prepare_auth_grading_fail",
          {
            p_order_kind: "member",
            p_order_id: orderId,
            p_fault_party: "carrier",
            p_reason: "carrier platform fault",
            p_carrier_liability_party: "platform",
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

      const receivable = await getSellerReceivableForOrder(orderId);
      expect(receivable).toBeNull();
    });
  },
);
