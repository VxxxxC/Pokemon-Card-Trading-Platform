import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  ensureMemberListingAcceptsAuthentication,
  findMemberListingForIntegration,
} from "../rewards/helpers/checkout-fixture";
import {
  clearSessionCache,
  getBuyerUserId,
  warmSession,
} from "../shared/auth-context";
import { hasBaseIntegrationEnv } from "../shared/env";
import { createServiceRoleClient } from "../shared/supabase-admin";
import { DEFAULT_FPS_MANUAL_TRANSFER_FEE_HKD } from "@/lib/platform/fps-payout-config";

describe.skipIf(!hasBaseIntegrationEnv()).sequential(
  "FPS manual transfer fee SSOT integration",
  () => {
    const createdOrderIds: string[] = [];
    const createdPayoutRequestIds: string[] = [];

    beforeAll(async () => {
      await warmSession("buyer");
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

    it("SQL helper matches TS constant and finalize snapshots gross/fee/net", async () => {
      const buyerId = getBuyerUserId();
      const admin = createServiceRoleClient();

      const { data: sqlFee, error: feeError } = await admin.rpc(
        "fn_platform_fps_manual_transfer_fee_hkd",
      );
      expect(feeError).toBeNull();
      expect(Number(sqlFee)).toBe(DEFAULT_FPS_MANUAL_TRANSFER_FEE_HKD);

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
      createdOrderIds.push(orderId);

      const inboundFee = 30;
      const { error: prepError } = await admin
        .from("member_orders")
        .update({
          payout_hold_until: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
          inbound_shipping_fee: inboundFee,
        })
        .eq("id", orderId);
      expect(prepError).toBeNull();

      const { data: orderRow } = await admin
        .from("member_orders")
        .select("seller_id, item_subtotal, final_price")
        .eq("id", orderId)
        .single();

      expect(orderRow?.seller_id).toBeTruthy();

      await admin
        .from("profiles")
        .update({
          fps_id: "999888777",
          fps_name: "FPS SSOT Test",
        })
        .eq("id", orderRow!.seller_id);

      const { data: finalizeData, error: finalizeError } = await admin.rpc(
        "rpc_finalize_member_fps_payout_ready",
        { p_order_id: orderId },
      );
      expect(finalizeError).toBeNull();
      expect(finalizeData).toBeTruthy();

      const itemSubtotal = Number(
        orderRow?.item_subtotal ?? orderRow?.final_price ?? 0,
      );
      const expectedGross = itemSubtotal + inboundFee;
      const expectedFee = DEFAULT_FPS_MANUAL_TRANSFER_FEE_HKD;
      const expectedNet = Math.max(expectedGross - expectedFee, 0);

      const { data: payoutRow, error: payoutError } = await admin
        .from("payout_requests")
        .select("id, amount, gross_payout_hkd, fps_transfer_fee_hkd")
        .eq("order_id", orderId)
        .maybeSingle();

      expect(payoutError).toBeNull();
      expect(payoutRow?.id).toBeTruthy();
      if (payoutRow?.id) {
        createdPayoutRequestIds.push(payoutRow.id);
      }

      expect(Number(payoutRow?.gross_payout_hkd)).toBe(expectedGross);
      expect(Number(payoutRow?.fps_transfer_fee_hkd)).toBe(expectedFee);
      expect(Number(payoutRow?.amount)).toBe(expectedNet);
    });
  },
);
