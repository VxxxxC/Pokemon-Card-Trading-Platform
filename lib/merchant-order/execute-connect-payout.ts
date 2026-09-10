import { enqueueB2cGradingPayoutCompletedEmail } from "@/lib/notifications/grading-emails";
import { enqueueConnectPayoutCompletedEmail, enqueueConnectPayoutFailedEmail, enqueueConnectPayoutProcessingEmail } from "@/lib/notifications/payout-emails";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripeClient } from "@/lib/stripe/env";
import {
  parseMerchantPayoutPreparation,
  type MerchantPayoutPreparation,
} from "@/lib/merchant-order/parse-merchant-payout-preparation";

export type ExecuteMerchantConnectPayoutResult =
  | { success: true; orderId: string; transferId?: string; alreadyApplied?: boolean }
  | { success: false; orderId: string; error: string };

type MerchantPayoutAdminRpcClient = {
  rpc(
    fn: "rpc_prepare_merchant_order_payout",
    args: { p_order_id: string },
  ): Promise<{ data: unknown; error: { message: string } | null }>;
  rpc(
    fn: "rpc_finalize_merchant_order_payout",
    args: {
      p_order_id: string;
      p_transfer_id: string | null;
      p_transfer_amount_cents: number;
      p_destination_account_id: string;
      p_recovery_applications: Array<{
        recovery_order_id: string;
        amount_applied: number;
      }>;
    },
  ): Promise<{ data: unknown; error: { message: string } | null }>;
  rpc(
    fn: "rpc_mark_merchant_order_payout_failed",
    args: {
      p_order_id: string;
      p_error: string;
    },
  ): Promise<{ data: unknown; error: { message: string } | null }>;
};

function buildRecoveryApplicationsPayload(
  prepared: Extract<MerchantPayoutPreparation, { alreadyApplied: false }>,
) {
  return prepared.recoveryApplications.map((application) => ({
    recovery_order_id: application.recoveryOrderId,
    amount_applied: application.amountApplied,
  }));
}

async function markMerchantConnectPayoutFailed(
  admin: MerchantPayoutAdminRpcClient,
  orderId: string,
  errorMessage: string,
): Promise<void> {
  const { error: markFailedError } = await admin.rpc(
    "rpc_mark_merchant_order_payout_failed",
    {
      p_order_id: orderId,
      p_error: errorMessage,
    },
  );
  if (markFailedError) {
    console.error(
      "[executeMerchantConnectPayout] mark payout failed",
      orderId,
      markFailedError.message,
    );
  }
}

export async function executeMerchantConnectPayout(
  orderId: string,
): Promise<ExecuteMerchantConnectPayoutResult> {
  const trimmedOrderId = orderId.trim();
  let prepared: MerchantPayoutPreparation | null = null;

  try {
    const stripe = await getStripeClient();
    if (!stripe) {
      return {
        success: false,
        orderId: trimmedOrderId,
        error: "撥款服務尚未設定",
      };
    }

    const admin = createAdminClient() as unknown as MerchantPayoutAdminRpcClient;
    const { data: prepareData, error: prepareError } = await admin.rpc(
      "rpc_prepare_merchant_order_payout",
      { p_order_id: trimmedOrderId },
    );

    if (prepareError) {
      return {
        success: false,
        orderId: trimmedOrderId,
        error: prepareError.message,
      };
    }

    prepared = parseMerchantPayoutPreparation(prepareData);
    if (!prepared) {
      return {
        success: false,
        orderId: trimmedOrderId,
        error: "invalid_payout_payload",
      };
    }

    if (prepared.alreadyApplied) {
      return {
        success: true,
        orderId: trimmedOrderId,
        alreadyApplied: true,
      };
    }

    await enqueueConnectPayoutProcessingEmail(prepared.orderId);

    const paymentIntent = await stripe.paymentIntents.retrieve(
      prepared.paymentIntentId,
      { expand: ["latest_charge"] },
    );
    const expectedBuyerTotalInCents = Math.round(
      prepared.buyerTotalAmount * 100,
    );
    const merchantPayoutInCents = Math.round(
      prepared.merchantPayoutAmount * 100,
    );
    const latestCharge =
      typeof paymentIntent.latest_charge === "string"
        ? paymentIntent.latest_charge
        : paymentIntent.latest_charge?.id;

    if (
      paymentIntent.status !== "succeeded" ||
      paymentIntent.currency !== "hkd" ||
      paymentIntent.metadata?.order_id !== prepared.orderId ||
      paymentIntent.amount_received < expectedBuyerTotalInCents ||
      !latestCharge ||
      merchantPayoutInCents < 0
    ) {
      throw new Error("payment_not_settled");
    }

    const recoveryApplications = buildRecoveryApplicationsPayload(prepared);

    if (merchantPayoutInCents === 0) {
      const { error: finalizeError } = await admin.rpc(
        "rpc_finalize_merchant_order_payout",
        {
          p_order_id: prepared.orderId,
          p_transfer_id: null,
          p_transfer_amount_cents: 0,
          p_destination_account_id: prepared.stripeAccountId,
          p_recovery_applications: recoveryApplications,
        },
      );

      if (finalizeError) {
        console.error(
          "[executeMerchantConnectPayout] finalize zero-net payout",
          prepared.orderId,
          finalizeError.message,
        );
        await markMerchantConnectPayoutFailed(
          admin,
          prepared.orderId,
          `finalize_failed: ${finalizeError.message}`,
        );
        await enqueueConnectPayoutFailedEmail({
          orderId: prepared.orderId,
          errorMessage: finalizeError.message,
        });
        return {
          success: false,
          orderId: trimmedOrderId,
          error: "finalize_failed",
        };
      }

      await enqueueConnectPayoutCompletedEmail({
        orderId: prepared.orderId,
        merchantPayoutAmount: 0,
      });

      return {
        success: true,
        orderId: trimmedOrderId,
      };
    }

    const transferPayload: Parameters<typeof stripe.transfers.create>[0] = {
      amount: merchantPayoutInCents,
      currency: "hkd",
      destination: prepared.stripeAccountId,
      transfer_group: `merchant_order_${prepared.orderId}`,
      metadata: {
        order_kind: "merchant_payout",
        order_id: prepared.orderId,
        destination_account_id: prepared.stripeAccountId,
        transfer_amount_cents: String(merchantPayoutInCents),
        commission_amount: String(prepared.commissionAmount),
        recovery_deduction_total: String(prepared.recoveryDeductionTotal),
      },
    };

    if (merchantPayoutInCents <= expectedBuyerTotalInCents) {
      transferPayload.source_transaction = latestCharge;
    }

    const transfer = await stripe.transfers.create(transferPayload, {
      idempotencyKey: `merchant-order-payout:${prepared.orderId}`,
    });

    const { error: finalizeError } = await admin.rpc(
      "rpc_finalize_merchant_order_payout",
      {
        p_order_id: prepared.orderId,
        p_transfer_id: transfer.id,
        p_transfer_amount_cents: transfer.amount,
        p_destination_account_id:
          typeof transfer.destination === "string"
            ? transfer.destination
            : (transfer.destination?.id ?? prepared.stripeAccountId),
        p_recovery_applications: recoveryApplications,
      },
    );

    if (finalizeError) {
      console.error(
        "[executeMerchantConnectPayout] finalize payout",
        prepared.orderId,
        transfer.id,
        finalizeError.message,
      );
      await markMerchantConnectPayoutFailed(
        admin,
        prepared.orderId,
        `finalize_failed: ${finalizeError.message}`,
      );
      await enqueueConnectPayoutFailedEmail({
        orderId: prepared.orderId,
        errorMessage: finalizeError.message,
      });
      return {
        success: false,
        orderId: trimmedOrderId,
        error: "finalize_failed",
      };
    }

    await enqueueConnectPayoutCompletedEmail({
      orderId: prepared.orderId,
      merchantPayoutAmount: prepared.merchantPayoutAmount,
    });

    return {
      success: true,
      orderId: trimmedOrderId,
      transferId: transfer.id,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "unknown payout error";

    if (prepared && !prepared.alreadyApplied) {
      const admin = createAdminClient() as unknown as MerchantPayoutAdminRpcClient;
      await markMerchantConnectPayoutFailed(
        admin,
        prepared.orderId,
        "stripe_transfer_failed",
      );
      await enqueueConnectPayoutFailedEmail({
        orderId: prepared.orderId,
        errorMessage: message,
      });
    }

    console.error("[executeMerchantConnectPayout]", error);
    return {
      success: false,
      orderId: trimmedOrderId,
      error:
        message === "payment_not_settled"
          ? "payment_not_settled"
          : "stripe_transfer_failed",
    };
  }
}
