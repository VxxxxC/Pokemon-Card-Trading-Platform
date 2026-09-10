export type CouponKind = "discount_coupon" | "free_shipping";

export function computeSubsidy(input: {
  kind: CouponKind;
  itemSubtotal: number;
  shippingFee: number;
  amountHkd: number;
  maxSubsidyHkd: number;
}): number {
  if (input.kind === "discount_coupon") {
    return Math.min(
      Math.max(input.amountHkd, 0),
      Math.max(input.itemSubtotal, 0),
    );
  }

  return Math.min(
    Math.max(input.shippingFee, 0),
    Math.max(input.maxSubsidyHkd, 0),
  );
}

export function computeBuyerTotal(input: {
  itemSubtotal: number;
  shippingFee: number;
  authFee: number;
  subsidy: number;
}): { total: number; buyerTotal: number } {
  const total = input.itemSubtotal + input.shippingFee + input.authFee;
  const buyerTotal = Math.max(total - input.subsidy, 0);
  return { total, buyerTotal };
}
