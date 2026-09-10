export function isMerchantOrderBuyerConfirmed(input: {
  buyerConfirmedAt?: string | null;
}): boolean {
  return Boolean(input.buyerConfirmedAt?.trim());
}

export function isMerchantOrderPayoutHeld(
  payoutStatus?: string | null,
): boolean {
  return payoutStatus === "held" || payoutStatus === "processing";
}

/** Hide default `pending` and checkout-phase rows; show after payout saga starts. */
export function shouldShowMerchantBuyerPayoutStatus(
  payoutStatus?: string | null,
  pendingPayment?: boolean,
): boolean {
  if (pendingPayment) {
    return false;
  }

  return (
    payoutStatus === "held" ||
    payoutStatus === "processing" ||
    payoutStatus === "paid" ||
    payoutStatus === "failed" ||
    payoutStatus === "frozen"
  );
}
