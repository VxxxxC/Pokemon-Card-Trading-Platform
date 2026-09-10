export const AUTH_ESCROW_CONFIG_KEY = "auth_escrow_config";

export const DEFAULT_AUTH_FEE_HKD = 150;
export const DEFAULT_SF_LEG_FEE_HKD = 30;

export const AUTH_FEE_HKD_MIN = 50;
export const AUTH_FEE_HKD_MAX = 1000;

export function parseAuthFeeFromSettings(value: unknown): number {
  if (!value || typeof value !== "object") {
    return DEFAULT_AUTH_FEE_HKD;
  }

  const raw =
    (value as Record<string, unknown>).auth_fee_hkd ??
    (value as Record<string, unknown>).authFeeHkd ??
    (value as Record<string, unknown>).appraisalFee;

  const fee = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(fee) || fee < AUTH_FEE_HKD_MIN || fee > AUTH_FEE_HKD_MAX) {
    return DEFAULT_AUTH_FEE_HKD;
  }

  return fee;
}

export function parseSfLegFeeFromSettings(value: unknown): number {
  if (!value || typeof value !== "object") {
    return DEFAULT_SF_LEG_FEE_HKD;
  }

  const raw =
    (value as Record<string, unknown>).sf_leg_fee_hkd ??
    (value as Record<string, unknown>).sfLegFeeHkd;

  const fee = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(fee) || fee < 0) {
    return DEFAULT_SF_LEG_FEE_HKD;
  }

  return fee;
}

export function validateAuthFeeHkd(fee: number): string | null {
  if (!Number.isFinite(fee) || fee < AUTH_FEE_HKD_MIN || fee > AUTH_FEE_HKD_MAX) {
    return `鑑定費須為 HK$${AUTH_FEE_HKD_MIN}–${AUTH_FEE_HKD_MAX}`;
  }
  return null;
}

export function formatAuthFeeLabel(fee: number): string {
  const rounded = Math.round(fee);
  return `HK$ ${rounded.toLocaleString("en-US")}`;
}

export function buildAuthEscrowConfigValue(
  existing: unknown,
  authFeeHkd: number,
): Record<string, number> {
  const sfLegFeeHkd = parseSfLegFeeFromSettings(existing);
  return {
    sf_leg_fee_hkd: sfLegFeeHkd,
    auth_fee_hkd: authFeeHkd,
  };
}
