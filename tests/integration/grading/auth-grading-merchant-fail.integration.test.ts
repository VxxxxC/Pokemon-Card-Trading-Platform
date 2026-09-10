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

type PreparePayload = {
  success?: boolean;
  void_mode?: string;
  capture_cents?: number;
  escrow_capture_model?: string;
};

describe.sequential(
  "auth grading merchant fail (integration)",
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
      const buyerId = getBuyerUserId();
      const seeded = await seedMerchantAuthOrderAtAuthenticating({
        listingId,
        buyerId,
        sellerId,
        suffix,
        buyerClient: getBuyerClient(),
        sellerClient: getSellerClient(),
        adminClient: getAdminClient(),
      });
      tracked.orderIds.push(seeded.orderId);
      return seeded;
    }

    merchantIt("G-BF1M: prepare buyer fault single → capture_auth_fee_only", async () => {
      const { orderId, authFeeCents } = await seedAuthenticatingOrder("bf1m");

      const payload = await runAsAdmin(async () => {
        const client = getAdminClient();
        const { data, error } = await client.rpc("rpc_prepare_auth_grading_fail", {
          p_order_kind: "merchant",
          p_order_id: orderId,
          p_fault_party: "buyer",
          p_reason: "integration merchant buyer fault",
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

    merchantIt("G-BF2M: prepare seller fault single → cancel", async () => {
      const { orderId } = await seedAuthenticatingOrder("bf2m");

      const payload = await runAsAdmin(async () => {
        const client = getAdminClient();
        const { data, error } = await client.rpc("rpc_prepare_auth_grading_fail", {
          p_order_kind: "merchant",
          p_order_id: orderId,
          p_fault_party: "seller",
          p_reason: "integration merchant seller fault prepare",
        });
        if (error) {
          throw new Error(error.message);
        }
        return data as PreparePayload;
      });

      expect(payload.success).toBe(true);
      expect(payload.void_mode).toBe("cancel");
      expect(payload.capture_cents ?? 0).toBe(0);
      expect(payload.escrow_capture_model).toBe("single");
    });

    merchantIt("G-BF3M: finalize buyer fault → auth_fee_captured", async () => {
      const { orderId, paymentIntentId } = await seedAuthenticatingOrder("bf3m");

      await runAsAdmin(async () => {
        const client = getAdminClient();
        const { error: prepareError } = await client.rpc("rpc_prepare_auth_grading_fail", {
          p_order_kind: "merchant",
          p_order_id: orderId,
          p_fault_party: "buyer",
          p_reason: "integration merchant buyer finalize",
        });
        expect(prepareError).toBeNull();

        const { error: finalizeError } = await client.rpc("rpc_finalize_auth_grading_fail", {
          p_order_kind: "merchant",
          p_order_id: orderId,
          p_payment_intent_id: paymentIntentId,
        });
        expect(finalizeError).toBeNull();
      });

      const row = await getMerchantOrderGradingFailRow(orderId);
      expect(row?.auth_result).toBe("failed");
      expect(row?.payment_capture_status).toBe("auth_fee_captured");
      expect(row?.fault_party).toBe("buyer");
      expect(row?.escrow_status).toBe("refunded");

      const ledger = await getMerchantLedgerGradingFailRecovery(orderId);
      expect(ledger).toBeNull();
    });

    merchantIt("G-BF4M: finalize seller fault → voided + merchant ledger recovery", async () => {
      const { orderId, paymentIntentId, buyerTotal } =
        await seedAuthenticatingOrder("bf4m");

      await runAsAdmin(async () => {
        const client = getAdminClient();
        const { error: prepareError } = await client.rpc(
          "rpc_prepare_auth_grading_fail",
          {
            p_order_kind: "merchant",
            p_order_id: orderId,
            p_fault_party: "seller",
            p_reason: "integration merchant seller fault",
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
      expect(row?.payment_capture_status).toBe("voided");
      expect(row?.fault_party).toBe("seller");
      expect(row?.escrow_status).toBe("refunded");

      const ledger = await getMerchantLedgerGradingFailRecovery(orderId);
      expect(ledger).not.toBeNull();
      expect(Number(ledger?.amount ?? 0)).toBeLessThan(0);
      expect(Math.abs(Number(ledger?.amount ?? 0))).toBe(buyerTotal);
    });

    merchantIt("G-BF10M: platform fault → voided, no merchant ledger recovery", async () => {
      const { orderId, paymentIntentId } = await seedAuthenticatingOrder("bf10m");

      await runAsAdmin(async () => {
        const client = getAdminClient();
        const { error: prepareError } = await client.rpc(
          "rpc_prepare_auth_grading_fail",
          {
            p_order_kind: "merchant",
            p_order_id: orderId,
            p_fault_party: "platform",
            p_reason: "integration merchant platform fault",
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
      expect(row?.payment_capture_status).toBe("voided");
      expect(row?.fault_party).toBe("platform");

      const ledger = await getMerchantLedgerGradingFailRecovery(orderId);
      expect(ledger).toBeNull();
    });

    merchantIt("G-BF11M: inconclusive fault → voided, no merchant ledger recovery", async () => {
      const { orderId, paymentIntentId } = await seedAuthenticatingOrder("bf11m");

      await runAsAdmin(async () => {
        const client = getAdminClient();
        const { error: prepareError } = await client.rpc(
          "rpc_prepare_auth_grading_fail",
          {
            p_order_kind: "merchant",
            p_order_id: orderId,
            p_fault_party: "inconclusive",
            p_reason: "integration merchant inconclusive",
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
      expect(row?.payment_capture_status).toBe("voided");
      expect(row?.fault_party).toBe("inconclusive");

      const ledger = await getMerchantLedgerGradingFailRecovery(orderId);
      expect(ledger).toBeNull();
    });

    merchantIt("G-BF5M: finalize succeeds when voided before finalize (cancel race)", async () => {
      const { orderId, paymentIntentId } = await seedAuthenticatingOrder("bf5m");

      await runAsAdmin(async () => {
        const client = getAdminClient();
        const { error: prepareError } = await client.rpc(
          "rpc_prepare_auth_grading_fail",
          {
            p_order_kind: "merchant",
            p_order_id: orderId,
            p_fault_party: "seller",
            p_reason: "voided before finalize",
          },
        );
        expect(prepareError).toBeNull();
      });

      const admin = (await import("../shared/supabase-admin")).createServiceRoleClient();
      const { error: voidError } = await admin
        .from("merchant_orders")
        .update({ payment_capture_status: "voided" })
        .eq("id", orderId)
        .eq("refund_status", "processing");
      expect(voidError).toBeNull();

      await runAsAdmin(async () => {
        const client = getAdminClient();
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
      expect(row?.payment_capture_status).toBe("voided");
    });
  },
);
