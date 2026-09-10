/**
 * B2C 商戶託管結帳計價（Payment Milestone 1）。
 *
 * 全額付訖：商品成交價 + 運費 + 鑑定費一次性鎖定平台託管。
 * 優惠券未接後端，暫不計入（Milestone 2）。
 */

import { PLATFORM_DEFAULT_COURIER_SHIPPING_FEE } from "@/lib/merchant/shipping-fee";
import { DEFAULT_AUTH_FEE_HKD } from "@/lib/platform/auth-escrow-config";

/** @deprecated Use shop `base_courier_shipping_fee`; kept for legacy references. */
export const SF_SHIPPING_FEE = PLATFORM_DEFAULT_COURIER_SHIPPING_FEE;
export const MEETUP_SHIPPING_FEE = 0;
/** @deprecated Use fetchPlatformAuthFeeHkd() or order snapshot auth_fee. */
export const AUTHENTICATION_FEE = DEFAULT_AUTH_FEE_HKD;

export const MERCHANT_SHIPPING_METHODS = ["sf", "meetup"] as const;
export type MerchantShippingMethod = (typeof MERCHANT_SHIPPING_METHODS)[number];

export function isMerchantShippingMethod(
  value: unknown,
): value is MerchantShippingMethod {
  return (
    typeof value === "string" &&
    (MERCHANT_SHIPPING_METHODS as readonly string[]).includes(value)
  );
}

export function computeCourierShippingFee(input: {
  shippingMethod: MerchantShippingMethod;
  baseFee: number;
  extraFee: number;
}): number {
  if (input.shippingMethod !== "sf") {
    return 0;
  }

  const base = Math.max(Math.round(input.baseFee), 0);
  const extra = Math.max(Math.round(input.extraFee), 0);
  return base + extra;
}

export function resolveShippingFee(
  method: MerchantShippingMethod,
  baseFee: number = PLATFORM_DEFAULT_COURIER_SHIPPING_FEE,
  extraFee = 0,
): number {
  return computeCourierShippingFee({
    shippingMethod: method,
    baseFee,
    extraFee,
  });
}

export type MerchantCheckoutAmounts = {
  itemSubtotal: number;
  shippingFee: number;
  authFee: number;
  totalAmount: number;
};

export function computeMerchantCheckoutAmounts(input: {
  itemSubtotal: number;
  shippingMethod: MerchantShippingMethod;
  useAuth: boolean;
  baseCourierShippingFee?: number;
  listingExtraShippingFee?: number;
  authFeeHkd?: number;
}): MerchantCheckoutAmounts {
  const itemSubtotal = Math.max(Math.round(input.itemSubtotal), 0);
  const shippingFee = computeCourierShippingFee({
    shippingMethod: input.shippingMethod,
    baseFee: input.baseCourierShippingFee ?? PLATFORM_DEFAULT_COURIER_SHIPPING_FEE,
    extraFee: input.listingExtraShippingFee ?? 0,
  });
  const authFee = input.useAuth ? (input.authFeeHkd ?? DEFAULT_AUTH_FEE_HKD) : 0;

  return {
    itemSubtotal,
    shippingFee,
    authFee,
    totalAmount: itemSubtotal + shippingFee + authFee,
  };
}

/** Stripe 以最小貨幣單位（仙）收費。 */
export function toStripeCents(amountHkd: number): number {
  return Math.round(amountHkd * 100);
}
