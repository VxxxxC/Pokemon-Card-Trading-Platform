export const DEFAULT_COMMISSION_RATE = 0.08;
export const COMMISSION_RATE_MIN = 0.01;
export const COMMISSION_RATE_MAX = 0.2;

export const PLATFORM_FINANCIAL_CONFIG_KEY = "platform_financial_config";

export function parseCommissionRateFromSettings(value: unknown): number {
  if (!value || typeof value !== "object") {
    return DEFAULT_COMMISSION_RATE;
  }

  const raw =
    (value as Record<string, unknown>).commissionRate ??
    (value as Record<string, unknown>).commission_rate;

  const rate = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(rate) || rate < COMMISSION_RATE_MIN || rate > COMMISSION_RATE_MAX) {
    return DEFAULT_COMMISSION_RATE;
  }

  return rate;
}

export function commissionRateToPercent(rate: number): number {
  return Math.round(rate * 1000) / 10;
}

export function commissionPercentToRate(percent: number): number {
  return percent / 100;
}

export function validateCommissionPercent(percent: number): string | null {
  if (!Number.isFinite(percent) || percent < 1 || percent > 20) {
    return "佣金率須為 1%–20%";
  }
  return null;
}

export function formatCommissionPercentLabel(rate: number): string {
  return `${commissionRateToPercent(rate).toFixed(1)}%`;
}
