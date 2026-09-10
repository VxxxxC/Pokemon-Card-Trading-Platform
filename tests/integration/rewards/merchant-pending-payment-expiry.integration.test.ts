/**
 * PG-S0-05 — merchant pending_payment expiry RPCs.
 * Coupon release on expiry is covered by I-P0-2 in coupon-partner-p0.integration.test.ts.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  clearSessionCache,
  getBuyerUserId,
  warmSession,
} from "../shared/auth-context";
import { createServiceRoleClient } from "../shared/supabase-admin";
import {
  backdateMerchantOrderCreatedAt,
  finalizeMerchantPendingPaymentExpiry,
  findMerchantListingForIntegration,
  listMerchantPendingPaymentExpiryCandidates,
  seedPendingMerchantOrders,
} from "./helpers/checkout-fixture";
import { wipeCouponFsmRun } from "./helpers/cleanup";
import { hasRewardsIntegrationEnv } from "./helpers/env";

describe.skipIf(!hasRewardsIntegrationEnv()).sequential(
  "merchant pending payment expiry (integration)",
  () => {
    const tracked = { orderIds: [] as string[] };
    let listingId = "";

    beforeAll(async () => {
      await warmSession("buyer");
      listingId = (await findMerchantListingForIntegration()).listingId;
    });

    afterAll(async () => {
      await wipeCouponFsmRun({
        orderIds: tracked.orderIds,
        userRewardIds: [],
      });
      await clearSessionCache();
    });

    it("S0-05-1: backdated order appears in expiry candidates; fresh order does not", async () => {
      const buyerId = getBuyerUserId();
      const [expiredOrderId, freshOrderId] = await seedPendingMerchantOrders(
        buyerId,
        listingId,
        2,
      );
      tracked.orderIds.push(expiredOrderId, freshOrderId);

      await backdateMerchantOrderCreatedAt(expiredOrderId, 8760);

      const candidates = await listMerchantPendingPaymentExpiryCandidates(200);
      const candidateIds = candidates.map((row) => row.order_id);

      expect(candidateIds).toContain(expiredOrderId);
      expect(candidateIds).not.toContain(freshOrderId);
    });

    it("S0-05-2: finalize expires order and restores inactive listing", async () => {
      const buyerId = getBuyerUserId();
      const [orderId] = await seedPendingMerchantOrders(buyerId, listingId, 1);
      tracked.orderIds.push(orderId);

      const admin = createServiceRoleClient();
      const { data: orderRow } = await admin
        .from("merchant_orders")
        .select("listing_id")
        .eq("id", orderId)
        .single();
      const orderListingId = orderRow?.listing_id ?? listingId;

      await admin
        .from("listings")
        .update({ status: "inactive" })
        .eq("id", orderListingId);

      await backdateMerchantOrderCreatedAt(orderId, 49);

      const first = await finalizeMerchantPendingPaymentExpiry(orderId);
      expect(first.success).toBe(true);
      expect(first.already_applied).toBe(false);
      expect(first.escrow_status).toBe("refunded");

      const { data: order } = await admin
        .from("merchant_orders")
        .select("escrow_status")
        .eq("id", orderId)
        .single();
      expect(order?.escrow_status).toBe("refunded");

      const { data: listing } = await admin
        .from("listings")
        .select("status")
        .eq("id", orderListingId)
        .single();
      expect(listing?.status).toBe("active");
    });

    it("S0-05-3: second finalize is idempotent", async () => {
      const buyerId = getBuyerUserId();
      const [orderId] = await seedPendingMerchantOrders(buyerId, listingId, 1);
      tracked.orderIds.push(orderId);

      await backdateMerchantOrderCreatedAt(orderId, 49);

      const first = await finalizeMerchantPendingPaymentExpiry(orderId);
      expect(first.already_applied).toBe(false);

      const second = await finalizeMerchantPendingPaymentExpiry(orderId);
      expect(second.success).toBe(true);
      expect(second.already_applied).toBe(true);
      expect(second.escrow_status).toBe("refunded");
    });
  },
);
