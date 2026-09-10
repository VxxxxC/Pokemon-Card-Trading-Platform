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
  "auth grading fail platform/inconclusive (integration)",
  () => {
    const tracked = { orderIds: [] as string[] };
    let orderId = "";
    const paymentIntentId = `pi_grading_bf10_${Date.now()}`;

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

      await promoteMemberAuthOrderToGrading(orderId, paymentIntentId);

      const row = await getMemberOrderGradingFailRow(orderId);
      expect(row?.escrow_capture_model).toBe("single");
    });

    afterAll(async () => {
      await wipeCouponFsmRun({
        orderIds: tracked.orderIds,
        userRewardIds: [],
        templateIds: [],
      });
      await clearSessionCache();
    });

    async function finalizeFault(party: "platform" | "inconclusive", reason: string) {
      await resetMemberAuthOrderGradingFailState(orderId);

      await runAsAdmin(async () => {
        const client = getAdminClient();
        const { error: prepareError } = await client.rpc(
          "rpc_prepare_auth_grading_fail",
          {
            p_order_kind: "member",
            p_order_id: orderId,
            p_fault_party: party,
            p_reason: reason,
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
    }

    it("G-BF10: platform fault → voided, no seller receivable", async () => {
      await finalizeFault("platform", "grading center operational error");

      const row = await getMemberOrderGradingFailRow(orderId);
      expect(row?.auth_result).toBe("failed");
      expect(row?.payment_capture_status).toBe("voided");
      expect(row?.fault_party).toBe("platform");

      const receivable = await getSellerReceivableForOrder(orderId);
      expect(receivable).toBeNull();
    });

    it("G-BF11: inconclusive fault → voided, no seller receivable", async () => {
      await finalizeFault("inconclusive", "insufficient evidence");

      const row = await getMemberOrderGradingFailRow(orderId);
      expect(row?.auth_result).toBe("failed");
      expect(row?.payment_capture_status).toBe("voided");
      expect(row?.fault_party).toBe("inconclusive");

      const receivable = await getSellerReceivableForOrder(orderId);
      expect(receivable).toBeNull();
    });
  },
);
