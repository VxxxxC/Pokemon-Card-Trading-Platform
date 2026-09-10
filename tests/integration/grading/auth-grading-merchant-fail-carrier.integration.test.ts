import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  clearSessionCache,
  getAdminClient,
  getBuyerClient,
  getBuyerUserId,
  getSellerClient,
  runAsAdmin,
  warmSession,
} from "../shared/auth-context";
import { wipeCouponFsmRun } from "../rewards/helpers/cleanup";
import {
  getMerchantGradingContext,
  hasMerchantGradingEnvVars,
  merchantIt,
  requireMerchantGradingEnvReady,
} from "./helpers/grading-merchant-env";
import {
  getMerchantLedgerGradingFailRecovery,
  getMerchantOrderGradingFailRow,
  seedMerchantAuthOrderAtAuthenticating,
} from "./helpers/grading-merchant-fixture";

describe.sequential(
  "auth grading merchant fail carrier liability (integration)",
  () => {
    const tracked = { orderIds: [] as string[] };
    let listingId = "";
    let sellerId = "";

    beforeAll(async () => {
      await warmSession("admin");
      await warmSession("buyer");
      await warmSession("seller");
      await requireMerchantGradingEnvReady();
      const ctx = getMerchantGradingContext();
      if (ctx) {
        listingId = ctx.listingId;
        sellerId = ctx.sellerId;
      }
    });

    afterAll(async () => {
      await wipeCouponFsmRun({
        orderIds: tracked.orderIds,
        userRewardIds: [],
        templateIds: [],
      });
      await clearSessionCache();
    });

    async function seedAuthenticatingOrder(suffix: string) {
      const seeded = await seedMerchantAuthOrderAtAuthenticating({
        listingId,
        buyerId: getBuyerUserId(),
        sellerId,
        suffix,
        buyerClient: getBuyerClient(),
        sellerClient: getSellerClient(),
        adminClient: getAdminClient(),
      });
      tracked.orderIds.push(seeded.orderId);
      return seeded;
    }

    merchantIt("G-BF8M: prepare carrier without liability is rejected", async () => {
      const { orderId } = await seedAuthenticatingOrder("bf8m");

      await runAsAdmin(async () => {
        const client = getAdminClient();
        const { error } = await client.rpc("rpc_prepare_auth_grading_fail", {
          p_order_kind: "merchant",
          p_order_id: orderId,
          p_fault_party: "carrier",
          p_reason: "missing liability",
        });
        expect(error).not.toBeNull();
      });
    });

    merchantIt("G-BF6M: carrier seller liability creates merchant ledger recovery", async () => {
      const { orderId, paymentIntentId } = await seedAuthenticatingOrder("bf6m");

      await runAsAdmin(async () => {
        const client = getAdminClient();
        const { error: prepareError } = await client.rpc(
          "rpc_prepare_auth_grading_fail",
          {
            p_order_kind: "merchant",
            p_order_id: orderId,
            p_fault_party: "carrier",
            p_reason: "carrier seller fault",
            p_carrier_liability_party: "seller",
          },
        );
        expect(prepareError).toBeNull();

        const { error: finalizeError } = await client.rpc(
          "rpc_finalize_auth_grading_fail",
          {
            p_order_kind: "merchant",
            p_order_id: orderId,
            p_payment_intent_id: paymentIntentId,
          },
        );
        expect(finalizeError).toBeNull();
      });

      const row = await getMerchantOrderGradingFailRow(orderId);
      expect(row?.auth_result).toBe("failed");
      expect(row?.fault_party).toBe("carrier");

      const ledger = await getMerchantLedgerGradingFailRecovery(orderId);
      expect(ledger).not.toBeNull();
      expect(Number(ledger?.amount ?? 0)).toBeLessThan(0);
    });

    merchantIt("G-BF7M: carrier platform liability has no merchant ledger recovery", async () => {
      const { orderId, paymentIntentId } = await seedAuthenticatingOrder("bf7m");

      await runAsAdmin(async () => {
        const client = getAdminClient();
        const { error: prepareError } = await client.rpc(
          "rpc_prepare_auth_grading_fail",
          {
            p_order_kind: "merchant",
            p_order_id: orderId,
            p_fault_party: "carrier",
            p_reason: "carrier platform fault",
            p_carrier_liability_party: "platform",
          },
        );
        expect(prepareError).toBeNull();

        const { error: finalizeError } = await client.rpc(
          "rpc_finalize_auth_grading_fail",
          {
            p_order_kind: "merchant",
            p_order_id: orderId,
            p_payment_intent_id: paymentIntentId,
          },
        );
        expect(finalizeError).toBeNull();
      });

      const ledger = await getMerchantLedgerGradingFailRecovery(orderId);
      expect(ledger).toBeNull();
    });
  },
);
