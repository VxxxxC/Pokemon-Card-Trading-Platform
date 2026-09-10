export type MerchantPayoutRecoveryApplication = {
  recoveryOrderId: string;
  amountApplied: number;
};

export type MerchantPayoutPreparation =
  | {
      alreadyApplied: true;
      orderId: string;
    }
  | {
      alreadyApplied: false;
      orderId: string;
      paymentIntentId: string;
      stripeAccountId: string;
      totalAmount: number;
      buyerTotalAmount: number;
      commissionAmount: number;
      merchantPayoutGross: number;
      merchantPayoutAmount: number;
      recoveryDeductionTotal: number;
      recoveryApplications: MerchantPayoutRecoveryApplication[];
    };

function readMerchantPayoutRpcString(
  row: Record<string, unknown>,
  keys: readonly string[],
): string {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed) {
        return trimmed;
      }
    }
  }
  return "";
}

function parseRecoveryApplications(
  value: unknown,
): MerchantPayoutRecoveryApplication[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const applications: MerchantPayoutRecoveryApplication[] = [];

  for (const item of value) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      continue;
    }

    const row = item as Record<string, unknown>;
    const recoveryOrderId = readMerchantPayoutRpcString(row, [
      "recovery_order_id",
    ]);
    const amountApplied = Number(row.amount_applied);

    if (
      !recoveryOrderId ||
      !Number.isFinite(amountApplied) ||
      amountApplied <= 0
    ) {
      continue;
    }

    applications.push({
      recoveryOrderId,
      amountApplied,
    });
  }

  return applications;
}

export function parseMerchantPayoutPreparation(
  value: unknown,
): MerchantPayoutPreparation | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const row = value as Record<string, unknown>;
  const orderId = readMerchantPayoutRpcString(row, ["order_id"]);
  if (!orderId) {
    return null;
  }

  if (row.already_applied === true) {
    return { alreadyApplied: true, orderId };
  }

  const paymentIntentId = readMerchantPayoutRpcString(row, [
    "stripe_payment_intent_id",
    "payment_intent_id",
  ]);
  const stripeAccountId = readMerchantPayoutRpcString(row, [
    "stripe_destination_account_id",
    "stripe_account_id",
  ]);
  const totalAmount = Number(row.total_amount);
  const buyerTotalAmount = Number(
    row.buyer_total_amount ?? row.total_amount,
  );
  const commissionAmount = Number(row.commission_amount);
  const merchantPayoutGross = Number(
    row.merchant_payout_gross ?? row.merchant_payout_amount,
  );
  const merchantPayoutAmount = Number(row.merchant_payout_amount);
  const recoveryDeductionTotal = Number(row.recovery_deduction_total ?? 0);
  const recoveryApplications = parseRecoveryApplications(
    row.recovery_applications,
  );

  if (
    !paymentIntentId ||
    !stripeAccountId ||
    !Number.isFinite(totalAmount) ||
    totalAmount <= 0 ||
    !Number.isFinite(buyerTotalAmount) ||
    buyerTotalAmount <= 0 ||
    !Number.isFinite(commissionAmount) ||
    commissionAmount < 0 ||
    !Number.isFinite(merchantPayoutGross) ||
    merchantPayoutGross < 0 ||
    !Number.isFinite(merchantPayoutAmount) ||
    merchantPayoutAmount < 0 ||
    !Number.isFinite(recoveryDeductionTotal) ||
    recoveryDeductionTotal < 0
  ) {
    return null;
  }

  return {
    alreadyApplied: false,
    orderId,
    paymentIntentId,
    stripeAccountId,
    totalAmount,
    buyerTotalAmount,
    commissionAmount,
    merchantPayoutGross,
    merchantPayoutAmount,
    recoveryDeductionTotal,
    recoveryApplications,
  };
}
