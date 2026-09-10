import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  ensureMemberListingAcceptsAuthentication,
  findMemberListingForIntegration,
} from "../rewards/helpers/checkout-fixture";
import {
  clearSessionCache,
  getAdminUserId,
  getBuyerUserId,
  warmSession,
} from "../shared/auth-context";
import { hasBaseIntegrationEnv } from "../shared/env";
import { createServiceRoleClient } from "../shared/supabase-admin";

async function seedReadyPayoutRequest(admin: ReturnType<typeof createServiceRoleClient>) {
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
    .select("seller_id")
    .eq("id", orderId)
    .single();

  await admin
    .from("profiles")
    .update({
      fps_id: `fps-${randomUUID().slice(0, 8)}`,
      fps_name: "Integration FPS Seller",
    })
    .eq("id", orderRow!.seller_id);

  await admin
    .from("member_orders")
    .update({
      payout_hold_until: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    })
    .eq("id", orderId);

  const { error: finalizeError } = await admin.rpc(
    "rpc_finalize_member_fps_payout_ready",
    { p_order_id: orderId },
  );
  if (finalizeError) {
    throw new Error(`[finalize fps payout] ${finalizeError.message}`);
  }

  const { data: payoutRow } = await admin
    .from("payout_requests")
    .select("id, status")
    .eq("order_id", orderId)
    .single();

  return {
    orderId,
    requestId: payoutRow!.id as string,
    status: payoutRow!.status as string,
  };
}

describe.skipIf(!hasBaseIntegrationEnv()).sequential(
  "Admin FPS payout mutations integration",
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

    it("completes ready payout and syncs member_orders to paid", async () => {
      const admin = createServiceRoleClient();
      const adminId = getAdminUserId();
      const seeded = await seedReadyPayoutRequest(admin);
      createdOrderIds.push(seeded.orderId);
      createdPayoutRequestIds.push(seeded.requestId);

      expect(seeded.status).toBe("ready");

      const { data, error } = await admin.rpc(
        "rpc_admin_set_fps_payout_request_status",
        {
          p_request_id: seeded.requestId,
          p_status: "completed",
          p_admin_id: adminId,
          p_admin_fps_reference: "FPS-REF-001",
        },
      );

      expect(error).toBeNull();
      expect(data).toBeTruthy();

      const { data: payoutRow } = await admin
        .from("payout_requests")
        .select("status, admin_fps_reference")
        .eq("id", seeded.requestId)
        .single();

      const { data: orderRow } = await admin
        .from("member_orders")
        .select("seller_payout_status")
        .eq("id", seeded.orderId)
        .single();

      expect(payoutRow?.status).toBe("completed");
      expect(payoutRow?.admin_fps_reference).toBe("FPS-REF-001");
      expect(orderRow?.seller_payout_status).toBe("paid");
    });

    it("rejects completing pending payout requests", async () => {
      const admin = createServiceRoleClient();
      const adminId = getAdminUserId();
      const seeded = await seedReadyPayoutRequest(admin);
      createdOrderIds.push(seeded.orderId);
      createdPayoutRequestIds.push(seeded.requestId);

      await admin
        .from("payout_requests")
        .update({
          status: "ready",
          fps_id_snapshot: "PENDING_FPS",
          fps_name_snapshot: "PENDING_FPS_NAME",
        })
        .eq("id", seeded.requestId);

      const { error } = await admin.rpc("rpc_admin_set_fps_payout_request_status", {
        p_request_id: seeded.requestId,
        p_status: "completed",
        p_admin_id: adminId,
        p_admin_fps_reference: "FPS-REF-002",
      });

      expect(error).toBeTruthy();
      expect(error?.message).toContain("待賣家補充 FPS");
    });

    it("rejects completing without admin fps reference", async () => {
      const admin = createServiceRoleClient();
      const adminId = getAdminUserId();
      const seeded = await seedReadyPayoutRequest(admin);
      createdOrderIds.push(seeded.orderId);
      createdPayoutRequestIds.push(seeded.requestId);

      const { error } = await admin.rpc("rpc_admin_set_fps_payout_request_status", {
        p_request_id: seeded.requestId,
        p_status: "completed",
        p_admin_id: adminId,
        p_admin_fps_reference: "   ",
      });

      expect(error).toBeTruthy();
      expect(error?.message).toContain("FPS 轉帳參考號");
    });

    it("rejects completing when seller payout is frozen", async () => {
      const admin = createServiceRoleClient();
      const adminId = getAdminUserId();
      const seeded = await seedReadyPayoutRequest(admin);
      createdOrderIds.push(seeded.orderId);
      createdPayoutRequestIds.push(seeded.requestId);

      await admin
        .from("member_orders")
        .update({ seller_payout_status: "frozen" })
        .eq("id", seeded.orderId);

      const { error } = await admin.rpc("rpc_admin_set_fps_payout_request_status", {
        p_request_id: seeded.requestId,
        p_status: "completed",
        p_admin_id: adminId,
        p_admin_fps_reference: "FPS-REF-003",
      });

      expect(error).toBeTruthy();
      expect(error?.message).toContain("凍結");
    });

    it("fails ready payout and syncs member_orders to failed", async () => {
      const admin = createServiceRoleClient();
      const adminId = getAdminUserId();
      const seeded = await seedReadyPayoutRequest(admin);
      createdOrderIds.push(seeded.orderId);
      createdPayoutRequestIds.push(seeded.requestId);

      const { error } = await admin.rpc("rpc_admin_set_fps_payout_request_status", {
        p_request_id: seeded.requestId,
        p_status: "failed",
        p_admin_id: adminId,
        p_admin_fps_reference: null,
      });

      expect(error).toBeNull();

      const { data: payoutRow } = await admin
        .from("payout_requests")
        .select("status")
        .eq("id", seeded.requestId)
        .single();

      const { data: orderRow } = await admin
        .from("member_orders")
        .select("seller_payout_status")
        .eq("id", seeded.orderId)
        .single();

      expect(payoutRow?.status).toBe("failed");
      expect(orderRow?.seller_payout_status).toBe("failed");
    });

    it("batch completes ready payouts atomically", async () => {
      const admin = createServiceRoleClient();
      const adminId = getAdminUserId();
      const first = await seedReadyPayoutRequest(admin);
      const second = await seedReadyPayoutRequest(admin);
      createdOrderIds.push(first.orderId, second.orderId);
      createdPayoutRequestIds.push(first.requestId, second.requestId);

      const { data, error } = await admin.rpc(
        "rpc_admin_batch_complete_fps_payout_requests",
        {
          p_request_ids: [first.requestId, second.requestId],
          p_admin_id: adminId,
        },
      );

      expect(error).toBeNull();
      expect((data as { completed_count?: number })?.completed_count).toBe(2);

      const { data: orders } = await admin
        .from("member_orders")
        .select("seller_payout_status")
        .in("id", [first.orderId, second.orderId]);

      expect(orders?.every((row) => row.seller_payout_status === "paid")).toBe(
        true,
      );
    });

    it("rejects batch complete when any selected payout is pending", async () => {
      const admin = createServiceRoleClient();
      const adminId = getAdminUserId();
      const ready = await seedReadyPayoutRequest(admin);
      const pending = await seedReadyPayoutRequest(admin);
      createdOrderIds.push(ready.orderId, pending.orderId);
      createdPayoutRequestIds.push(ready.requestId, pending.requestId);

      await admin
        .from("payout_requests")
        .update({
          status: "pending",
          fps_id_snapshot: "PENDING_FPS",
          fps_name_snapshot: "PENDING_FPS_NAME",
        })
        .eq("id", pending.requestId);

      const { error } = await admin.rpc(
        "rpc_admin_batch_complete_fps_payout_requests",
        {
          p_request_ids: [ready.requestId, pending.requestId],
          p_admin_id: adminId,
        },
      );

      expect(error).toBeTruthy();

      const { data: readyOrder } = await admin
        .from("member_orders")
        .select("seller_payout_status")
        .eq("id", ready.orderId)
        .single();

      const { data: readyPayout } = await admin
        .from("payout_requests")
        .select("status")
        .eq("id", ready.requestId)
        .single();

      expect(readyPayout?.status).toBe("ready");
      expect(readyOrder?.seller_payout_status).toBe("ready");
    });
  },
);
