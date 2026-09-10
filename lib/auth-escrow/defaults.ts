/** Mirrors `platform_settings.auth_escrow_config` defaults (Phase A). */
import { DEFAULT_AUTH_FEE_HKD } from "@/lib/platform/auth-escrow-config";

export const AUTH_ESCROW_SF_LEG_FEE_HKD = 30;
export const AUTH_ESCROW_AUTH_FEE_HKD = DEFAULT_AUTH_FEE_HKD;

/** DB default is 0 before prepare; treat non-positive as unprepared checkout snapshot. */
export function resolveAuthEscrowSfLegFeeHkd(stored: number | null | undefined): number {
  const value = Number(stored ?? 0);
  return value > 0 ? value : AUTH_ESCROW_SF_LEG_FEE_HKD;
}

export function estimateAuthEscrowCheckoutTotal(
  itemSubtotal: number,
  authFeeHkd: number = DEFAULT_AUTH_FEE_HKD,
  sfLegFeeHkd: number = AUTH_ESCROW_SF_LEG_FEE_HKD,
): number {
  return itemSubtotal + authFeeHkd + sfLegFeeHkd * 2;
}
