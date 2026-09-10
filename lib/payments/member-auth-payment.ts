import {
  AUTH_ESCROW_AUTH_FEE_HKD,
  AUTH_ESCROW_SF_LEG_FEE_HKD,
  estimateAuthEscrowCheckoutTotal,
} from "@/lib/auth-escrow/defaults";

/** Legacy estimate when persisted buyer_total_amount is unavailable. */
export function calculateMemberAuthPaymentTotal(cardPrice: number): number {
  return estimateAuthEscrowCheckoutTotal(cardPrice);
}

export { AUTH_ESCROW_AUTH_FEE_HKD, AUTH_ESCROW_SF_LEG_FEE_HKD };
