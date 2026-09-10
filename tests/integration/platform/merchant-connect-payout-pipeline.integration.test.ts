import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  backdateMerchantPayoutHold,
  confirmMerchantBuyerReceipt,
  seedMerchantOrderReadyForBuyerConfirm,
} from "../merchant/helpers/merchant-order-fixture";
import {
  clearSessionCache,
  getAdminClient,
  getAdminUserId,
  getBuyerClient,
  getBuyerUserId,
  getSellerClient,
  runAsAdmin,
  warmSession,
} from "../shared/auth-context";
import { hasBaseIntegrationEnv } from "../shared/env";
import { createServiceRoleClient } from "../shared/supabase-admin";
import {
  hasMerchantGradingEnvVars,
  requireMerchantGradingEnvReady,
  warmMerchantGradingEnv,
} from "../grading/helpers/grading-merchant-env";
import {
  getMerchantLedgerGradingFailRecovery,
  seedMerchantAuthOrderAtAuthenticating,
} from "../grading/helpers/grading-merchant-fixture";

async function seedHeldMerchantOrderReadyForPayout(
  runId: string,
  suffix: string,
  merchantId?: string,
): Promise<string> {
  const buyerId = getBuyerUserId();
  const { orderId } = await seedMerchantOrderReadyForBuyerConfirm({
    buyerId,
    suffix: `${runId}-${suffix}`,
    merchantId,
  });
  await confirmMerchantBuyerReceipt(orderId);
  await backdateMerchantPayoutHold(orderId);
  return orderId;
}

const OPEN_MERCHANT_ESCROW_STATUSES = new Set([
  "pending_payment",
  "payment_held",
  "shipped",
  "authenticating",
  "authenticated",
]);

function isEligibleConnectPayoutRefundStatus(
  refundStatus: string | null,
): boolean {
  const normalized = refundStatus?.trim().toLowerCase() ?? "";
  return !normalized || normalized === "none";
}

async function assertOrderIsConnectPayoutCandidate(orderId: string): Promise<void> {
  const admin = createServiceRoleClient();
  const { data: row, error } = await admin
    .from("merchant_orders")
    .select(
      "payout_status, payout_hold_until, buyer_confirmed_at, stripe_transfer_id, merchant_payout_amount, stripe_payment_intent_id, escrow_status, refund_status",
    )
    .eq("id", orderId)
    .maybeSingle();

  expect(error).toBeNull();
  expect(row).not.toBeNull();

  expect(row?.payout_status).toBe("held");
  expect(row?.buyer_confirmed_at).toBeTruthy();
  expect(row?.payout_hold_until).toBeTruthy();

  const { data: holdElapsed, error: holdElapsedError } = await admin.rpc(
    "rpc_e2e_is_merchant_payout_hold_elapsed",
    { p_order_id: orderId },
  );
  expect(holdElapsedError).toBeNull();
  expect(holdElapsed).toBe(true);
  expect(row?.stripe_transfer_id).toBeNull();
  expect(Number(row?.merchant_payout_amount ?? 0)).toBeGreaterThan(0);
  expect(row?.stripe_payment_intent_id?.trim()).toBeTruthy();
  expect(OPEN_MERCHANT_ESCROW_STATUSES.has(row!.escrow_status!)).toBe(true);
  expect(
    isEligibleConnectPayoutRefundStatus(row?.refund_status ?? null),
  ).toBe(true);
}

describe.skipIf(!hasBaseIntegrationEnv()).sequential(
  "Merchant Connect payout pipeline integration",
  () => {
    const runId = String(Date.now());
    const createdOrderIds: string[] = [];

    beforeAll(async () => {
      await warmSession("buyer");
      await warmSession("admin");
      if (hasMerchantGradingEnvVars()) {
        await warmMerchantGradingEnv();
      }
    });

    afterAll(async () => {
      const admin = createServiceRoleClient();
      for (const orderId of createdOrderIds) {
        await admin.from("merchant_orders").delete().eq("id", orderId);
      }
      await clearSessionCache();
    });

    it("M1 held expired order meets connect payout candidate criteria", async () => {
      const orderId = await seedHeldMerchantOrderReadyForPayout(runId, "m1");
      createdOrderIds.push(orderId);

      await assertOrderIsConnectPayoutCandidate(orderId);

      const admin = createServiceRoleClient();
      const { error } = await admin.rpc(
        "rpc_list_merchant_connect_payout_candidates",
        { p_limit: 50 },
      );
      expect(error).toBeNull();
    });

    it("M2 resets failed payout and allows prepare again", async () => {
      const orderId = await seedHeldMerchantOrderReadyForPayout(runId, "m2");
      createdOrderIds.push(orderId);

      const admin = createServiceRoleClient();
      const adminId = getAdminUserId();

      const { error: failError } = await admin.rpc(
        "rpc_mark_merchant_order_payout_failed",
        {
          p_order_id: orderId,
          p_error: "integration_test_failed",
        },
      );
      expect(failError).toBeNull();

      const { error: resetError } = await admin.rpc(
        "rpc_admin_reset_merchant_connect_payout_retry",
        {
          p_order_id: orderId,
          p_admin_id: adminId,
        },
      );
      expect(resetError).toBeNull();

      const { data: afterReset, error: afterResetError } = await admin
        .from("merchant_orders")
        .select("payout_status, payout_error")
        .eq("id", orderId)
        .maybeSingle();

      expect(afterResetError).toBeNull();
      expect(afterReset?.payout_status).toBe("held");
      expect(afterReset?.payout_error).toBeNull();

      const { data: preparePayload, error: prepareError } = await admin.rpc(
        "rpc_prepare_merchant_order_payout",
        { p_order_id: orderId },
      );

      expect(prepareError).toBeNull();
      expect(preparePayload).toMatchObject({ success: true });

      const { data: afterPrepare, error: afterPrepareError } = await admin
        .from("merchant_orders")
        .select("payout_status")
        .eq("id", orderId)
        .maybeSingle();

      expect(afterPrepareError).toBeNull();
      expect(afterPrepare?.payout_status).toBe("processing");
    });

    it("M2b recovers from processing after finalize_failed mark (P2.5)", async () => {
      const buyerId = getBuyerUserId();
      const admin = createServiceRoleClient();
      const { orderId, merchantId } = await seedMerchantOrderReadyForBuyerConfirm({
        buyerId,
        suffix: `${runId}-m2b`,
      });
      createdOrderIds.push(orderId);

      const { error: clearRecoveryError } = await admin.rpc(
        "rpc_e2e_clear_unsettled_grading_recovery",
        { p_merchant_id: merchantId },
      );
      expect(clearRecoveryError).toBeNull();

      await confirmMerchantBuyerReceipt(orderId);
      await backdateMerchantPayoutHold(orderId);

      const adminId = getAdminUserId();

      const { error: prepareError } = await admin.rpc(
        "rpc_prepare_merchant_order_payout",
        { p_order_id: orderId },
      );
      expect(prepareError).toBeNull();

      const { data: processingRow, error: processingError } = await admin
        .from("merchant_orders")
        .select("payout_status, merchant_payout_amount")
        .eq("id", orderId)
        .maybeSingle();
      expect(processingError).toBeNull();
      expect(processingRow?.payout_status).toBe("processing");
      const preparedPayoutAmount = Number(
        processingRow?.merchant_payout_amount ?? 0,
      );
      expect(preparedPayoutAmount).toBeGreaterThan(0);

      const { error: failError } = await admin.rpc(
        "rpc_mark_merchant_order_payout_failed",
        {
          p_order_id: orderId,
          p_error: "finalize_failed: integration_simulated",
        },
      );
      expect(failError).toBeNull();

      const { data: failedRow, error: failedRowError } = await admin
        .from("merchant_orders")
        .select("merchant_payout_amount")
        .eq("id", orderId)
        .maybeSingle();
      expect(failedRowError).toBeNull();
      if (
        !failedRow?.merchant_payout_amount ||
        Number(failedRow.merchant_payout_amount) <= 0
      ) {
        const { error: restoreAmountError } = await admin
          .from("merchant_orders")
          .update({ merchant_payout_amount: preparedPayoutAmount })
          .eq("id", orderId);
        expect(restoreAmountError).toBeNull();
      }

      await backdateMerchantPayoutHold(orderId);

      const { error: resetError } = await admin.rpc(
        "rpc_admin_reset_merchant_connect_payout_retry",
        {
          p_order_id: orderId,
          p_admin_id: adminId,
        },
      );
      expect(resetError).toBeNull();

      const { error: rePrepareError } = await admin.rpc(
        "rpc_prepare_merchant_order_payout",
        { p_order_id: orderId },
      );
      expect(rePrepareError).toBeNull();

      const { data: afterRetry, error: afterRetryError } = await admin
        .from("merchant_orders")
        .select("payout_status, payout_error")
        .eq("id", orderId)
        .maybeSingle();

      expect(afterRetryError).toBeNull();
      expect(afterRetry?.payout_status).toBe("processing");
      expect(afterRetry?.payout_error).toBeNull();
    });

    it("M3 rejects reset when payout is frozen", async () => {
      const orderId = await seedHeldMerchantOrderReadyForPayout(runId, "m3-frozen");
      createdOrderIds.push(orderId);

      const admin = createServiceRoleClient();
      const { error: stateError } = await admin.rpc(
        "rpc_e2e_set_merchant_order_payout_retry_test_state",
        {
          p_order_id: orderId,
          p_scenario: "frozen",
        },
      );
      expect(stateError).toBeNull();

      const { error } = await admin.rpc(
        "rpc_admin_reset_merchant_connect_payout_retry",
        {
          p_order_id: orderId,
          p_admin_id: getAdminUserId(),
        },
      );

      expect(error).not.toBeNull();
      expect(error?.message).toMatch(/凍結/);
    });

    it("M3 rejects reset when hold has not elapsed", async () => {
      const buyerId = getBuyerUserId();
      const { orderId } = await seedMerchantOrderReadyForBuyerConfirm({
        buyerId,
        suffix: `${runId}-m3-hold`,
      });
      createdOrderIds.push(orderId);
      await confirmMerchantBuyerReceipt(orderId);

      const admin = createServiceRoleClient();
      await admin.rpc("rpc_mark_merchant_order_payout_failed", {
        p_order_id: orderId,
        p_error: "hold_not_elapsed_test",
      });

      const { error } = await admin.rpc(
        "rpc_admin_reset_merchant_connect_payout_retry",
        {
          p_order_id: orderId,
          p_admin_id: getAdminUserId(),
        },
      );

      expect(error).not.toBeNull();
      expect(error?.message).toMatch(/保留期/);
    });

    it("M3 rejects reset when stripe_transfer_id exists", async () => {
      const orderId = await seedHeldMerchantOrderReadyForPayout(
        runId,
        "m3-transfer",
      );
      createdOrderIds.push(orderId);

      const admin = createServiceRoleClient();
      const { error: stateError } = await admin.rpc(
        "rpc_e2e_set_merchant_order_payout_retry_test_state",
        {
          p_order_id: orderId,
          p_scenario: "bound_transfer",
        },
      );
      expect(stateError).toBeNull();

      const { error } = await admin.rpc(
        "rpc_admin_reset_merchant_connect_payout_retry",
        {
          p_order_id: orderId,
          p_admin_id: getAdminUserId(),
        },
      );

      expect(error).not.toBeNull();
      expect(error?.message).toMatch(/Stripe Transfer/);
    });

    it("M3 rejects reset for failed refund inside hold window (I-H12)", async () => {
      const orderId = await seedHeldMerchantOrderReadyForPayout(runId, "m3-i-h12");
      createdOrderIds.push(orderId);

      const admin = createServiceRoleClient();
      const { error: stateError } = await admin.rpc(
        "rpc_e2e_set_merchant_order_payout_retry_test_state",
        {
          p_order_id: orderId,
          p_scenario: "refund_failed_in_window",
        },
      );
      expect(stateError).toBeNull();

      const { error } = await admin.rpc(
        "rpc_admin_reset_merchant_connect_payout_retry",
        {
          p_order_id: orderId,
          p_admin_id: getAdminUserId(),
        },
      );

      expect(error).not.toBeNull();
      expect(error?.message).toMatch(/退款失敗保留期/);
    });

    it("M4: seller-fault grading recovery deducts from connect payout prepare", async () => {
      if (!hasMerchantGradingEnvVars()) {
        throw new Error(
          "TC-P04 requires E2E_SELLER_* + E2E_LISTING_ID merchant grading env",
        );
      }

      const ctx = await requireMerchantGradingEnvReady();
      const { listingId, sellerId } = ctx;

      const admin = createServiceRoleClient();
      const { error: clearPriorError } = await admin.rpc(
        "rpc_e2e_clear_unsettled_grading_recovery",
        { p_merchant_id: sellerId },
      );
      expect(clearPriorError).toBeNull();

      const recoverySeed = await seedMerchantAuthOrderAtAuthenticating({
        listingId,
        buyerId: getBuyerUserId(),
        sellerId,
        suffix: `m4-recovery-${runId}`,
        buyerClient: getBuyerClient(),
        sellerClient: getSellerClient(),
        adminClient: getAdminClient(),
      });
      createdOrderIds.push(recoverySeed.orderId);

      await runAsAdmin(async () => {
        const client = getAdminClient();
        const { error: prepareError } = await client.rpc(
          "rpc_prepare_auth_grading_fail",
          {
            p_order_kind: "merchant",
            p_order_id: recoverySeed.orderId,
            p_fault_party: "seller",
            p_reason: "integration M4 seller fault recovery",
          },
        );
        expect(prepareError).toBeNull();

        const { error: finalizeError } = await client.rpc(
          "rpc_finalize_auth_grading_fail",
          {
            p_order_kind: "merchant",
            p_order_id: recoverySeed.orderId,
            p_payment_intent_id: recoverySeed.paymentIntentId,
          },
        );
        expect(finalizeError).toBeNull();
      });

      const { data: clearedOrder, error: orderError } = await admin
        .from("merchant_orders")
        .select("seller_settlement_status")
        .eq("id", recoverySeed.orderId)
        .single();
      expect(orderError).toBeNull();
      expect(clearedOrder?.seller_settlement_status).toBe("cleared");

      const recoveryLedger = await getMerchantLedgerGradingFailRecovery(
        recoverySeed.orderId,
      );
      expect(recoveryLedger).not.toBeNull();
      const recoveryAmount = Math.abs(Number(recoveryLedger?.amount ?? 0));
      expect(recoveryAmount).toBeGreaterThan(0);

      const payoutOrderId = await seedHeldMerchantOrderReadyForPayout(
        runId,
        "m4-payout",
        sellerId,
      );
      createdOrderIds.push(payoutOrderId);

      const { data: preparePayload, error: prepareError } = await admin.rpc(
        "rpc_prepare_merchant_order_payout",
        { p_order_id: payoutOrderId },
      );

      expect(prepareError).toBeNull();
      expect(preparePayload).toMatchObject({ success: true });

      const deductionTotal = Number(
        (preparePayload as { recovery_deduction_total?: number })
          .recovery_deduction_total ?? 0,
      );
      const payoutGross = Number(
        (preparePayload as { merchant_payout_gross?: number })
          .merchant_payout_gross ?? 0,
      );
      const payoutNet = Number(
        (preparePayload as { merchant_payout_amount?: number })
          .merchant_payout_amount ?? 0,
      );

      expect(deductionTotal).toBeGreaterThan(0);
      expect(deductionTotal).toBeLessThanOrEqual(recoveryAmount);
      expect(payoutNet).toBeCloseTo(payoutGross - deductionTotal, 2);

      const applications =
        (preparePayload as { recovery_applications?: Array<{ recovery_order_id: string }> })
          .recovery_applications ?? [];
      expect(
        applications.some(
          (row) =>
            String(row.recovery_order_id) === String(recoverySeed.orderId),
        ),
      ).toBe(true);
    });
  },
);
