import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  clearSessionCache,
  getAdminClient,
  getBuyerUserId,
  runAsAdmin,
  warmSession,
} from "../shared/auth-context";
import { hasBaseIntegrationEnv, hasGradingStripeSmokeEnv } from "../shared/env";
import { createServiceRoleClient } from "../shared/supabase-admin";
import {
  ensureMemberListingAcceptsAuthentication,
  findMemberListingForIntegration,
  seedPendingMemberAuthOrders,
} from "../rewards/helpers/checkout-fixture";
import { wipeCouponFsmRun } from "../rewards/helpers/cleanup";
import {
  getMemberOrderGradingFailRow,
  getSellerReceivableForOrder,
  promoteMemberAuthOrderToGradingLegacy,
  readMemberAuthPipelineAmounts,
} from "./helpers/grading-fail-fixture";
import {
  executeGradingFailStripeLeg,
  finalizeAuthGradingFail,
  prepareAuthGradingFail,
  promoteStripeSmokeOrderToLegacyGrading,
  seedGradingFailStripeSmokeOrder,
} from "./helpers/grading-stripe-smoke-fixture";

describe.skipIf(!hasBaseIntegrationEnv()).sequential(
  "auth grading fail legacy (integration)",
  () => {
    const tracked = { orderIds: [] as string[] };
    const paymentIntentId = `pi_legacy_${Date.now()}`;

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

    it("G-LF1: legacy seller fault → capture_zero finalize + receivable auth+inbound", async () => {
      const listing = await findMemberListingForIntegration();
      await ensureMemberListingAcceptsAuthentication(listing.listingId);
      const buyerId = getBuyerUserId();
      const [orderId] = await seedPendingMemberAuthOrders(
        buyerId,
        listing.listingId,
        1,
      );
      tracked.orderIds.push(orderId);

      const amounts = await promoteMemberAuthOrderToGradingLegacy(
        orderId,
        paymentIntentId,
      );
      const expectedReceivable = amounts.authFee + amounts.inbound;

      let listingId = "";
      await runAsAdmin(async () => {
        const client = getAdminClient();
        const { data: prepared, error: prepareError } = await client.rpc(
          "rpc_prepare_auth_grading_fail",
          {
            p_order_kind: "member",
            p_order_id: orderId,
            p_fault_party: "seller",
            p_reason: "legacy seller fault integration",
          },
        );
        expect(prepareError).toBeNull();
        expect((prepared as { void_mode?: string })?.void_mode).toBe("capture_zero");

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
      expect(row?.fault_party).toBe("seller");
      expect(row?.escrow_capture_model).toBeNull();

      const receivable = await getSellerReceivableForOrder(orderId);
      expect(receivable).not.toBeNull();
      expect(Number(receivable?.amount_hkd ?? 0)).toBe(expectedReceivable);

      const admin = createServiceRoleClient();
      const { data: orderRow } = await admin
        .from("member_orders")
        .select("listing_id")
        .eq("id", orderId)
        .maybeSingle();
      listingId = orderRow?.listing_id ?? "";

      const { data: listingRow } = await admin
        .from("listings")
        .select("status")
        .eq("id", listingId)
        .maybeSingle();
      expect(listingRow?.status).toBe("active");
    });
  },
);

describe.skipIf(!hasGradingStripeSmokeEnv()).sequential(
  "auth grading fail legacy stripe smoke (integration)",
  () => {
    const tracked = { orderIds: [] as string[] };

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

    it("G-LF2: legacy seller fault capture_zero on real Stripe PI", async () => {
      await warmSession("admin");
      await warmSession("buyer");

      const ctx = await seedGradingFailStripeSmokeOrder();
      tracked.orderIds.push(ctx.orderId);

      await promoteStripeSmokeOrderToLegacyGrading(ctx);

      const amounts = await readMemberAuthPipelineAmounts(ctx.orderId);
      const prepared = await runAsAdmin(async () => {
        const client = getAdminClient();
        return prepareAuthGradingFail(client, {
          orderId: ctx.orderId,
          faultParty: "seller",
          reason: "legacy stripe smoke seller fault",
        });
      });

      expect(prepared.success).toBe(true);
      expect(prepared.void_mode).toBe("capture_zero");
      expect(prepared.escrow_capture_model).toBeNull();

      await executeGradingFailStripeLeg(prepared, ctx.orderId);

      await runAsAdmin(async () => {
        const client = getAdminClient();
        await finalizeAuthGradingFail(client, {
          orderId: ctx.orderId,
          paymentIntentId: ctx.paymentIntentId,
        });
      });

      const row = await getMemberOrderGradingFailRow(ctx.orderId);
      expect(row?.auth_result).toBe("failed");
      expect(row?.payment_capture_status).toBe("auth_fee_captured");

      const receivable = await getSellerReceivableForOrder(ctx.orderId);
      expect(receivable).not.toBeNull();
      expect(Number(receivable?.amount_hkd ?? 0)).toBe(
        amounts.authFee + amounts.inbound,
      );
    });
  },
);
