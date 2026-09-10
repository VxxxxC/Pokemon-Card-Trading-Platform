import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mapResolutionOptionToInput } from "@/lib/moderation/resolution-config";
import { resolveAdminModerationCase } from "@/app/actions/admin-moderation";
import {
  clearSessionCache,
  getBuyerUserId,
  runAsAdmin,
  warmSession,
} from "../shared/auth-context";
import { createServiceRoleClient } from "../shared/supabase-admin";
import { getSellerId, hasFullModerationIntegrationEnv } from "./helpers/env";
import {
  getMemberOrderRefundStatus,
  seedMemberP2pMeetupOrder,
  seedModerationCaseWithMemberOrderContext,
} from "./helpers/phase-h-fixtures";
import { seedMatrixMemberListingForSeller } from "./helpers/sanction-fixtures";

describe.skipIf(!hasFullModerationIntegrationEnv()).sequential(
  "P2P meetup dispute — no platform order refund (PG-S3-11)",
  () => {
    const runId = String(Date.now());
    const buyerId = () => getBuyerUserId();
    const sellerId = () => getSellerId();
    let listingId = "";
    let orderId = "";

    beforeAll(async () => {
      await warmSession("admin");
      await warmSession("buyer");
      const listing = await seedMatrixMemberListingForSeller(
        sellerId(),
        runId,
        "p2p-no-refund",
      );
      listingId = listing.listingId;
      orderId = await seedMemberP2pMeetupOrder({
        buyerId: buyerId(),
        sellerId: sellerId(),
        listingId,
        runId,
        suffix: "p2p-no-refund",
      });
    });

    afterAll(async () => {
      const admin = createServiceRoleClient();
      if (orderId) {
        await admin.from("member_orders").delete().eq("id", orderId);
      }
      if (listingId) {
        await admin.from("listings").delete().eq("id", listingId);
      }
      await clearSessionCache();
    });

    it("PG-S3-11: member_p2p order refund ineligible + resolve leaves refund_status none", async () => {
      const admin = createServiceRoleClient();
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
      expect(row?.orderKind).toBe("member_p2p");
      expect(row?.ineligibleReason).toMatch(/P2P/);

      const { caseId } = await seedModerationCaseWithMemberOrderContext({
        reporterId: buyerId(),
        subjectId: sellerId(),
        orderId,
        runId,
        suffix: "PG-S3-11",
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
