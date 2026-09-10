import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getAdminDashboardMetrics } from "@/app/actions/admin-dashboard";
import {
  findMemberListingForIntegration,
  seedPendingMemberAuthOrders,
} from "../rewards/helpers/checkout-fixture";
import {
  confirmMerchantBuyerReceipt,
  seedMerchantOrderReadyForBuyerConfirm,
} from "../merchant/helpers/merchant-order-fixture";
import {
  clearSessionCache,
  getBuyerUserId,
  warmSession,
  runAsAdmin,
} from "../shared/auth-context";
import { hasBaseIntegrationEnv } from "../shared/env";
import { createServiceRoleClient } from "../shared/supabase-admin";

const MERCHANT_GMV_DELTA = 777;
const MEMBER_GMV_DELTA = 333;
const MEMBER_AUTH_FEE = 150;

function parseHkd(formatted: string): number {
  const normalized = formatted.replace(/,/g, "");
  const match = normalized.match(/-?[\d.]+/);
  return match ? Number(match[0]) : 0;
}

function parseCountWithUnit(formatted: string): number {
  const match = formatted.match(/[\d,]+/);
  if (!match) return 0;
  return Number(match[0].replace(/,/g, ""));
}

describe.skipIf(!hasBaseIntegrationEnv()).sequential(
  "admin dashboard metrics integration",
  () => {
    const runId = String(Date.now());
    const createdMerchantOrderIds: string[] = [];
    const createdMemberOrderIds: string[] = [];

    beforeAll(async () => {
      await warmSession("buyer");
      await warmSession("admin");
    });

    afterAll(async () => {
      const admin = createServiceRoleClient();
      for (const orderId of createdMerchantOrderIds) {
        await admin.from("merchant_orders").delete().eq("id", orderId);
      }
      for (const orderId of createdMemberOrderIds) {
        await admin.from("member_orders").delete().eq("id", orderId);
      }
      await clearSessionCache();
    });

    it("increases GMV and appraisal totals when merchant and member orders complete", async () => {
      const buyerId = getBuyerUserId();
      const admin = createServiceRoleClient();
      const nowIso = new Date().toISOString();

      const baseline = await runAsAdmin(async () => {
        const result = await getAdminDashboardMetrics();
        expect(result.success).toBe(true);
        if (!result.success) {
          throw new Error(result.error);
        }
        return result.data;
      });

      const { orderId: merchantOrderId } =
        await seedMerchantOrderReadyForBuyerConfirm({
          buyerId,
          suffix: `${runId}-dash-merchant`,
          itemSubtotal: MERCHANT_GMV_DELTA,
        });
      createdMerchantOrderIds.push(merchantOrderId);

      await confirmMerchantBuyerReceipt(merchantOrderId);

      const { error: merchantFinalizeError } = await admin
        .from("merchant_orders")
        .update({
          escrow_status: "completed_and_transferred",
          buyer_confirmed_at: nowIso,
          item_subtotal: MERCHANT_GMV_DELTA,
          commission_amount: 77.7,
          auth_fee: MEMBER_AUTH_FEE,
          auth_fee_captured_at: nowIso,
          updated_at: nowIso,
        })
        .eq("id", merchantOrderId);

      expect(merchantFinalizeError).toBeNull();

      const { listingId } = await findMemberListingForIntegration();
      const [memberOrderId] = await seedPendingMemberAuthOrders(
        buyerId,
        listingId,
        1,
      );
      createdMemberOrderIds.push(memberOrderId);

      const { error: memberFinalizeError } = await admin
        .from("member_orders")
        .update({
          status: "completed",
          item_subtotal: MEMBER_GMV_DELTA,
          final_price: MEMBER_GMV_DELTA,
          buyer_confirmed_at: nowIso,
          auth_fee: MEMBER_AUTH_FEE,
          auth_fee_captured_at: nowIso,
          updated_at: nowIso,
        })
        .eq("id", memberOrderId);

      expect(memberFinalizeError).toBeNull();

      const updated = await runAsAdmin(async () => {
        const result = await getAdminDashboardMetrics();
        expect(result.success).toBe(true);
        if (!result.success) {
          throw new Error(result.error);
        }
        return result.data;
      });

      const gmvDelta =
        parseHkd(updated.marketVolume.totalGmv) -
        parseHkd(baseline.marketVolume.totalGmv);
      const settledDelta =
        parseCountWithUnit(updated.marketVolume.settledCount) -
        parseCountWithUnit(baseline.marketVolume.settledCount);
      const appraisalDelta =
        parseHkd(updated.revenues.appraisalTotal) -
        parseHkd(baseline.revenues.appraisalTotal);

      expect(gmvDelta).toBeGreaterThanOrEqual(MERCHANT_GMV_DELTA + MEMBER_GMV_DELTA);
      expect(settledDelta).toBeGreaterThanOrEqual(2);
      expect(appraisalDelta).toBeGreaterThanOrEqual(MEMBER_AUTH_FEE * 2);
    });
  },
);
