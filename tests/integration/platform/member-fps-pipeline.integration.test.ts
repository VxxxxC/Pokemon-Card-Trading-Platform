import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  ensureMemberListingAcceptsAuthentication,
  findMemberListingForIntegration,
} from "../rewards/helpers/checkout-fixture";
import {
  clearSessionCache,
  getAdminUserId,
  getBuyerClient,
  getBuyerUserId,
  warmSession,
} from "../shared/auth-context";
import { hasBaseIntegrationEnv } from "../shared/env";
import { createServiceRoleClient } from "../shared/supabase-admin";
import { DEFAULT_FPS_MANUAL_TRANSFER_FEE_HKD } from "@/lib/platform/fps-payout-config";

type AdminClient = ReturnType<typeof createServiceRoleClient>;

async function seedRefundEligibleOrder(admin: AdminClient) {
  const buyerId = getBuyerUserId();
  const listing = await findMemberListingForIntegration({
    excludeBuyerId: buyerId,
  });
  await ensureMemberListingAcceptsAuthentication(listing.listingId);

  const { data: orderId, error: seedError } = await admin.rpc(
    "rpc_e2e_seed_member_auth_refund_eligible_order",
    {
      p_listing_id: listing.listingId,
      p_buyer_id: buyerId,
    },
  );
  if (seedError || !orderId) {
    throw new Error(
      `[seed member auth refund eligible] ${seedError?.message ?? "missing order id"}`,
    );
  }

  const { data: orderRow } = await admin
    .from("member_orders")
    .select("seller_id, item_subtotal, final_price")
    .eq("id", orderId)
    .single();

  return {
    orderId: orderId as string,
    sellerId: orderRow!.seller_id as string,
    itemSubtotal: Number(orderRow?.item_subtotal ?? orderRow?.final_price ?? 0),
  };
}

async function resetOrderForBuyerConfirm(admin: AdminClient, orderId: string) {
  const { error } = await admin
    .from("member_orders")
    .update({
      escrow_status: "shipped",
      status: "pending",
      buyer_confirmed_at: null,
      payout_hold_until: null,
      seller_payout_status: "none",
    })
    .eq("id", orderId);
  if (error) {
    throw new Error(`[reset for buyer confirm] ${error.message}`);
  }
}

async function setSellerFpsProfile(
  admin: AdminClient,
  sellerId: string,
  suffix = randomUUID().slice(0, 8),
) {
  await admin
    .from("profiles")
    .update({
      fps_id: `fps-${suffix}`,
      fps_name: "Pipeline FPS Seller",
    })
    .eq("id", sellerId);
}

async function confirmBuyerReceived(orderId: string) {
  const buyerId = getBuyerUserId();
  const buyerClient = getBuyerClient();
  const { data, error } = await buyerClient.rpc("rpc_confirm_buyer_received", {
    p_order_id: orderId,
    p_buyer_id: buyerId,
  });
  if (error) {
    throw new Error(`[confirm buyer received] ${error.message}`);
  }
  return data;
}

async function backdatePayoutHold(
  admin: AdminClient,
  orderId: string,
  inboundFee = 0,
) {
  const { error } = await admin
    .from("member_orders")
    .update({
      payout_hold_until: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
      inbound_shipping_fee: inboundFee,
    })
    .eq("id", orderId);
  if (error) {
    throw new Error(`[backdate payout hold] ${error.message}`);
  }
}

describe.skipIf(!hasBaseIntegrationEnv()).sequential(
  "Member FPS payout pipeline integration",
  () => {
    const createdOrderIds: string[] = [];
    const createdPayoutRequestIds: string[] = [];

    beforeAll(async () => {
      await warmSession("buyer");
      await warmSession("admin");
    });

    afterAll(async () => {
      const admin = createServiceRoleClient();
      for (const requestId of createdPayoutRequestIds) {
        await admin.from("payout_requests").delete().eq("id", requestId);
      }
      for (const orderId of createdOrderIds) {
        await admin.from("member_orders").delete().eq("id", orderId);
      }
      await clearSessionCache();
    });

    it("1A: buyer confirm sets held and T+3 payout hold", async () => {
      const admin = createServiceRoleClient();
      const seeded = await seedRefundEligibleOrder(admin);
      createdOrderIds.push(seeded.orderId);

      await resetOrderForBuyerConfirm(admin, seeded.orderId);
      await confirmBuyerReceived(seeded.orderId);

      const { data: orderRow } = await admin
        .from("member_orders")
        .select(
          "seller_payout_status, buyer_confirmed_at, payout_hold_until, escrow_status, status",
        )
        .eq("id", seeded.orderId)
        .single();

      expect(orderRow?.seller_payout_status).toBe("held");
      expect(orderRow?.buyer_confirmed_at).toBeTruthy();
      expect(orderRow?.escrow_status).toBe("released");
      expect(orderRow?.status).toBe("completed");

      const holdUntil = new Date(orderRow!.payout_hold_until!).getTime();
      const confirmedAt = new Date(orderRow!.buyer_confirmed_at!).getTime();
      const threeDaysMs = 3 * 24 * 60 * 60 * 1000;
      const toleranceMs = 5 * 60 * 1000;
      expect(holdUntil).toBeGreaterThan(confirmedAt + threeDaysMs - toleranceMs);
      expect(holdUntil).toBeLessThan(confirmedAt + threeDaysMs + toleranceMs);
    });

    it("1B: lists ready candidates after hold elapses", async () => {
      const admin = createServiceRoleClient();
      const seeded = await seedRefundEligibleOrder(admin);
      createdOrderIds.push(seeded.orderId);

      await resetOrderForBuyerConfirm(admin, seeded.orderId);
      await setSellerFpsProfile(admin, seeded.sellerId);
      await confirmBuyerReceived(seeded.orderId);
      await backdatePayoutHold(admin, seeded.orderId);

      const { data: candidates, error } = await admin.rpc(
        "rpc_list_member_fps_payout_ready_candidates",
        { p_limit: 50 },
      );

      expect(error).toBeNull();
      const orderIds = (candidates ?? []).map(
        (row: { order_id: string }) => row.order_id,
      );
      expect(orderIds).toContain(seeded.orderId);
    });

    it("1B: finalize creates ready payout request with fee snapshot", async () => {
      const admin = createServiceRoleClient();
      const seeded = await seedRefundEligibleOrder(admin);
      createdOrderIds.push(seeded.orderId);

      const inboundFee = 25;
      await resetOrderForBuyerConfirm(admin, seeded.orderId);
      await setSellerFpsProfile(admin, seeded.sellerId);
      await confirmBuyerReceived(seeded.orderId);
      await backdatePayoutHold(admin, seeded.orderId, inboundFee);

      const { error: finalizeError } = await admin.rpc(
        "rpc_finalize_member_fps_payout_ready",
        { p_order_id: seeded.orderId },
      );
      expect(finalizeError).toBeNull();

      const expectedGross = seeded.itemSubtotal + inboundFee;
      const expectedFee = DEFAULT_FPS_MANUAL_TRANSFER_FEE_HKD;
      const expectedNet = Math.max(expectedGross - expectedFee, 0);

      const { data: payoutRow } = await admin
        .from("payout_requests")
        .select("id, status, amount, gross_payout_hkd, fps_transfer_fee_hkd")
        .eq("order_id", seeded.orderId)
        .single();

      expect(payoutRow?.id).toBeTruthy();
      if (payoutRow?.id) {
        createdPayoutRequestIds.push(payoutRow.id);
      }
      expect(payoutRow?.status).toBe("ready");
      expect(Number(payoutRow?.gross_payout_hkd)).toBe(expectedGross);
      expect(Number(payoutRow?.fps_transfer_fee_hkd)).toBe(expectedFee);
      expect(Number(payoutRow?.amount)).toBe(expectedNet);

      const { data: orderRow } = await admin
        .from("member_orders")
        .select("seller_payout_status")
        .eq("id", seeded.orderId)
        .single();
      expect(orderRow?.seller_payout_status).toBe("ready");
    });

    it("full chain: confirm → finalize → admin complete → paid", async () => {
      const admin = createServiceRoleClient();
      const adminId = getAdminUserId();
      const seeded = await seedRefundEligibleOrder(admin);
      createdOrderIds.push(seeded.orderId);

      await resetOrderForBuyerConfirm(admin, seeded.orderId);
      await setSellerFpsProfile(admin, seeded.sellerId);
      await confirmBuyerReceived(seeded.orderId);
      await backdatePayoutHold(admin, seeded.orderId);

      const { error: finalizeError } = await admin.rpc(
        "rpc_finalize_member_fps_payout_ready",
        { p_order_id: seeded.orderId },
      );
      expect(finalizeError).toBeNull();

      const { data: payoutRow } = await admin
        .from("payout_requests")
        .select("id")
        .eq("order_id", seeded.orderId)
        .single();
      expect(payoutRow?.id).toBeTruthy();
      createdPayoutRequestIds.push(payoutRow!.id);

      const { error: completeError } = await admin.rpc(
        "rpc_admin_set_fps_payout_request_status",
        {
          p_request_id: payoutRow!.id,
          p_status: "completed",
          p_admin_id: adminId,
          p_admin_fps_reference: "FPS-PIPELINE-REF",
        },
      );
      expect(completeError).toBeNull();

      const { data: completedPayout } = await admin
        .from("payout_requests")
        .select("status, admin_fps_reference")
        .eq("id", payoutRow!.id)
        .single();

      const { data: orderRow } = await admin
        .from("member_orders")
        .select("seller_payout_status")
        .eq("id", seeded.orderId)
        .single();

      expect(completedPayout?.status).toBe("completed");
      expect(completedPayout?.admin_fps_reference).toBe("FPS-PIPELINE-REF");
      expect(orderRow?.seller_payout_status).toBe("paid");
    });

    it("duplicate finalize raises and keeps a single payout request", async () => {
      const admin = createServiceRoleClient();
      const seeded = await seedRefundEligibleOrder(admin);
      createdOrderIds.push(seeded.orderId);

      await resetOrderForBuyerConfirm(admin, seeded.orderId);
      await setSellerFpsProfile(admin, seeded.sellerId);
      await confirmBuyerReceived(seeded.orderId);
      await backdatePayoutHold(admin, seeded.orderId);

      const { error: firstError } = await admin.rpc(
        "rpc_finalize_member_fps_payout_ready",
        { p_order_id: seeded.orderId },
      );
      expect(firstError).toBeNull();

      const { data: payoutRows } = await admin
        .from("payout_requests")
        .select("id")
        .eq("order_id", seeded.orderId);
      expect(payoutRows).toHaveLength(1);
      createdPayoutRequestIds.push(payoutRows![0]!.id);

      const { error: secondError } = await admin.rpc(
        "rpc_finalize_member_fps_payout_ready",
        { p_order_id: seeded.orderId },
      );
      expect(secondError).toBeTruthy();
      expect(secondError?.message).toContain("訂單不符合 FPS 出款條件或已處理");

      const { data: afterRows } = await admin
        .from("payout_requests")
        .select("id")
        .eq("order_id", seeded.orderId);
      expect(afterRows).toHaveLength(1);
    });
  },
);
