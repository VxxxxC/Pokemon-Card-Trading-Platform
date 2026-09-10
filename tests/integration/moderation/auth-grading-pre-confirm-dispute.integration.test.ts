import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mapResolutionOptionToInput } from "@/lib/moderation/resolution-config";
import { resolveAdminModerationCase } from "@/app/actions/admin-moderation";
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
import { promoteMemberAuthOrderToShippedPassed } from "../grading/helpers/grading-fail-fixture";
import { createServiceRoleClient } from "../shared/supabase-admin";
import {
  getMemberOrderRefundStatus,
  seedModerationCaseWithMemberOrderContext,
} from "./helpers/phase-h-fixtures";

describe.skipIf(!hasBaseIntegrationEnv()).sequential(
  "PG-S2-02 / TC-P03 — pre buyer-confirm dispute on passed auth outbound",
  () => {
    const runId = String(Date.now());
    const tracked = { orderIds: [] as string[] };
    let orderId = "";
    const paymentIntentId = `pi_tc_p03_${runId}`;
    const outboundTracking = `SF-P03-${runId.slice(-8)}`;

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

      await runAsAdmin(async () => {
        const client = getAdminClient();
        const { error } = await client.rpc("rpc_admin_submit_grading_outbound", {
          p_order_kind: "member",
          p_order_id: orderId,
          p_tracking_no: outboundTracking,
        });
        if (error) {
          throw new Error(error.message);
        }
      });
    });

    afterAll(async () => {
      await wipeCouponFsmRun({
        orderIds: tracked.orderIds,
        userRewardIds: [],
        templateIds: [],
      });
      await clearSessionCache();
    });

    it("PG-S2-02a: refund ineligible while buyer has not confirmed receipt", async () => {
      const admin = createServiceRoleClient();
      const { data: orderRow, error: orderError } = await admin
        .from("member_orders")
        .select(
          "auth_result, escrow_status, outbound_tracking_no, buyer_confirmed_at, payment_capture_status",
        )
        .eq("id", orderId)
        .maybeSingle();

      expect(orderError).toBeNull();
      expect(orderRow?.auth_result).toBe("passed");
      expect(orderRow?.escrow_status).toBe("shipped");
      expect(orderRow?.outbound_tracking_no).toBe(outboundTracking);
      expect(orderRow?.buyer_confirmed_at).toBeNull();
      expect(orderRow?.payment_capture_status).toBe("fully_captured");

      const { data: eligibility, error: eligibilityError } = await admin.rpc(
        "fn_moderation_order_refund_eligible",
        { p_order_id: orderId },
      );
      expect(eligibilityError).toBeNull();

      const row = eligibility as {
        eligible?: boolean;
        orderKind?: string;
        ineligibleReason?: string;
      };
      expect(row?.eligible).toBe(false);
      expect(row?.orderKind).toBe("member_auth");
      expect(row?.ineligibleReason).toContain("買家尚未確認收貨");
    });

    it("PG-S2-02b: admin dispute resolves warn-only without order refund", async () => {
      const buyerId = getBuyerUserId();
      const admin = createServiceRoleClient();
      const { data: sellerRow } = await admin
        .from("member_orders")
        .select("seller_id")
        .eq("id", orderId)
        .maybeSingle();
      expect(sellerRow?.seller_id).toBeTruthy();

      const { caseId } = await seedModerationCaseWithMemberOrderContext({
        reporterId: buyerId,
        subjectId: sellerRow!.seller_id!,
        orderId,
        runId,
        suffix: "PG-S2-02",
      });

      await runAsAdmin(async () => {
        const blocked = await resolveAdminModerationCase({
          caseId,
          ...mapResolutionOptionToInput("upheld", "member"),
          orderRefund: {
            enabled: true,
            orderId,
            faultParty: "seller",
          },
        });
        expect(blocked.success).toBe(false);
      });

      await runAsAdmin(async () => {
        const result = await resolveAdminModerationCase({
          caseId,
          ...mapResolutionOptionToInput("upheld_warn_only", "member"),
        });
        expect(result.success).toBe(true);
      });

      expect(await getMemberOrderRefundStatus(orderId)).toBe("none");
    });
  },
);
