export type UserCouponTab = "redeemable" | "redeemed" | "expired";

export type CouponExpiryRow = {
  is_used: boolean | null;
  calculated_expiry: string | null;
};

/** Mirrors SQL `calculated_expiry < now()` used in fn_compute_platform_subsidy. */
export function isCouponExpiredSqlStyle(
  calculatedExpiry: string | null | undefined,
  now: Date,
): boolean {
  if (!calculatedExpiry) {
    return false;
  }

  const expiry = new Date(calculatedExpiry);
  if (Number.isNaN(expiry.getTime())) {
    return false;
  }

  return expiry < now;
}

export function classifyCouponTab(row: CouponExpiryRow, now: Date): UserCouponTab {
  if (row.is_used) {
    return "redeemed";
  }

  if (isCouponExpiredSqlStyle(row.calculated_expiry, now)) {
    return "expired";
  }

  return "redeemable";
}
