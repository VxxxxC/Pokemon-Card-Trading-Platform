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

type PreparePayload = {
  success?: boolean;
  void_mode?: string;
  capture_cents?: number;
  escrow_capture_model?: string;
};

describe.skipIf(!hasBaseIntegrationEnv()).sequential(
  "auth grading fail single capture (integration)",
  () => {
    const tracked = { orderIds: [] as string[] };
    let orderId = "";
    let authFeeCents = 0;
    const paymentIntentId = `pi_grading_bf_${Date.now()}`;

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
      authFeeCents = Math.round(Number(row?.auth_fee ?? 0) * 100);
      expect(authFeeCents).toBeGreaterThan(0);
    });

    afterAll(async () => {
      await wipeCouponFsmRun({
        orderIds: tracked.orderIds,
        userRewardIds: [],
        templateIds: [],
      });
      await clearSessionCache();
    });

    it("G-BF1: prepare buyer fault single → capture_auth_fee_only", async () => {
      await resetMemberAuthOrderGradingFailState(orderId);

      const payload = await runAsAdmin(async () => {
        const client = getAdminClient();
        const { data, error } = await client.rpc("rpc_prepare_auth_grading_fail", {
          p_order_kind: "member",
          p_order_id: orderId,
          p_fault_party: "buyer",
          p_reason: "integration buyer fault",
        });
        if (error) {
          throw new Error(error.message);
        }
        return data as PreparePayload;
      });

      expect(payload.success).toBe(true);
      expect(payload.void_mode).toBe("capture_auth_fee_only");
      expect(payload.capture_cents).toBe(authFeeCents);
      expect(payload.escrow_capture_model).toBe("single");
    });

    it("G-BF2: prepare seller fault single → cancel", async () => {
      await resetMemberAuthOrderGradingFailState(orderId);

      const payload = await runAsAdmin(async () => {
        const client = getAdminClient();
        const { data, error } = await client.rpc("rpc_prepare_auth_grading_fail", {
          p_order_kind: "member",
          p_order_id: orderId,
          p_fault_party: "seller",
          p_reason: "integration seller fault",
        });
        if (error) {
          throw new Error(error.message);
        }
        return data as PreparePayload;
      });

      expect(payload.success).toBe(true);
      expect(payload.void_mode).toBe("cancel");
      expect(payload.capture_cents ?? 0).toBe(0);
    });

    it("G-BF3: finalize buyer fault → auth_fee_captured", async () => {
      await resetMemberAuthOrderGradingFailState(orderId);

      await runAsAdmin(async () => {
        const client = getAdminClient();
        const { error: prepareError } = await client.rpc(
          "rpc_prepare_auth_grading_fail",
          {
            p_order_kind: "member",
            p_order_id: orderId,
            p_fault_party: "buyer",
            p_reason: "finalize buyer",
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
      expect(row?.payment_capture_status).toBe("auth_fee_captured");
      expect(row?.fault_party).toBe("buyer");

      const receivable = await getSellerReceivableForOrder(orderId);
      expect(receivable).toBeNull();
    });

    it("G-BF4: finalize seller fault → voided + seller receivable", async () => {
      const sellerOrderId = tracked.orderIds[0];
      await resetMemberAuthOrderGradingFailState(sellerOrderId);

      await runAsAdmin(async () => {
        const client = getAdminClient();
        const { error: prepareError } = await client.rpc(
          "rpc_prepare_auth_grading_fail",
          {
            p_order_kind: "member",
            p_order_id: sellerOrderId,
            p_fault_party: "seller",
            p_reason: "finalize seller",
          },
        );
        expect(prepareError).toBeNull();

        const { error: finalizeError } = await client.rpc(
          "rpc_finalize_auth_grading_fail",
          {
            p_order_kind: "member",
            p_order_id: sellerOrderId,
            p_payment_intent_id: paymentIntentId,
          },
        );
        expect(finalizeError).toBeNull();
      });

      const row = await getMemberOrderGradingFailRow(sellerOrderId);
      expect(row?.auth_result).toBe("failed");
      expect(row?.payment_capture_status).toBe("voided");
      expect(row?.fault_party).toBe("seller");

      const receivable = await getSellerReceivableForOrder(sellerOrderId);
      expect(receivable).not.toBeNull();
      expect(Number(receivable?.amount_hkd ?? 0)).toBeGreaterThan(0);
    });

    it("G-BF5: finalize succeeds when voided before finalize (cancel race)", async () => {
      const listing = await findMemberListingForIntegration();
      await ensureMemberListingAcceptsAuthentication(listing.listingId);
      const buyerId = getBuyerUserId();
      const [raceOrderId] = await seedPendingMemberAuthOrders(
        buyerId,
        listing.listingId,
        1,
      );
      tracked.orderIds.push(raceOrderId);
      await promoteMemberAuthOrderToGrading(raceOrderId, paymentIntentId);

      await resetMemberAuthOrderGradingFailState(raceOrderId);

      await runAsAdmin(async () => {
        const client = getAdminClient();
        const { error: prepareError } = await client.rpc(
          "rpc_prepare_auth_grading_fail",
          {
            p_order_kind: "member",
            p_order_id: raceOrderId,
            p_fault_party: "seller",
            p_reason: "voided before finalize",
          },
        );
        expect(prepareError).toBeNull();
      });

      const admin = (await import("../shared/supabase-admin")).createServiceRoleClient();
      const { error: voidError } = await admin
        .from("member_orders")
        .update({ payment_capture_status: "voided" })
        .eq("id", raceOrderId)
        .eq("refund_status", "processing");
      expect(voidError).toBeNull();

      await runAsAdmin(async () => {
        const client = getAdminClient();
        const { error: finalizeError } = await client.rpc(
          "rpc_finalize_auth_grading_fail",
          {
            p_order_kind: "member",
            p_order_id: raceOrderId,
            p_payment_intent_id: paymentIntentId,
          },
        );
        expect(finalizeError).toBeNull();
      });

      const row = await getMemberOrderGradingFailRow(raceOrderId);
      expect(row?.auth_result).toBe("failed");
      expect(row?.payment_capture_status).toBe("voided");
    });
  },
);
