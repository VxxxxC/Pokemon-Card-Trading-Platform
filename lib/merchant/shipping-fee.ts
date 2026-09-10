export const PLATFORM_DEFAULT_COURIER_SHIPPING_FEE = 30;

export const SHOP_BASE_COURIER_SHIPPING_FEE_MIN = 0;
export const SHOP_BASE_COURIER_SHIPPING_FEE_MAX = 500;

export const LISTING_EXTRA_SHIPPING_FEE_MIN = 0;
export const LISTING_EXTRA_SHIPPING_FEE_MAX = 200;

export const COURIER_SHIPPING_FEE_TOTAL_MAX = 999;

export function parseShippingFeeInput(
  value: unknown,
): { ok: true; amount: number } | { ok: false; error: string } {
  if (value === null || value === undefined || value === "") {
    return { ok: true, amount: 0 };
  }

  const raw = typeof value === "number" ? value : Number(String(value).trim());
  if (!Number.isFinite(raw)) {
    return { ok: false, error: "請輸入有效的運費金額" };
  }

  if (!Number.isInteger(raw)) {
    return { ok: false, error: "運費須為整數港元" };
  }

  return { ok: true, amount: raw };
}

export function validateShopBaseCourierShippingFee(
  amount: number,
): string | null {
  if (amount < SHOP_BASE_COURIER_SHIPPING_FEE_MIN) {
    return "店舖基本運費不可為負數";
  }
  if (amount > SHOP_BASE_COURIER_SHIPPING_FEE_MAX) {
    return `店舖基本運費不可超過 HK$ ${SHOP_BASE_COURIER_SHIPPING_FEE_MAX}`;
  }
  return null;
}

export function validateListingExtraShippingFee(amount: number): string | null {
  if (amount < LISTING_EXTRA_SHIPPING_FEE_MIN) {
    return "附加運費不可為負數";
  }
  if (amount > LISTING_EXTRA_SHIPPING_FEE_MAX) {
    return `附加運費不可超過 HK$ ${LISTING_EXTRA_SHIPPING_FEE_MAX}`;
  }
  return null;
}

export function validateCourierShippingFeeTotal(
  baseFee: number,
  extraFee: number,
): string | null {
  const total = baseFee + extraFee;
  if (total > COURIER_SHIPPING_FEE_TOTAL_MAX) {
    return `快遞運費總額不可超過 HK$ ${COURIER_SHIPPING_FEE_TOTAL_MAX}`;
  }
  return null;
}
