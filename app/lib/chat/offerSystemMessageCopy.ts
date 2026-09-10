/** Localized thread copy for SYSTEM_OFFER_* chat rows (SSOT for map + filter + realtime). */
export const DUPLICATE_PENDING_OFFER_ERROR =
  "您已有進行中的出價，請等待賣家回應或被拒絕後再出價。";

export const SYSTEM_OFFER_ACCEPTED_BUYER_BASE = "賣家已接受出價，商品已成功鎖定";
export const SYSTEM_OFFER_ACCEPTED_SELLER_BASE = "你已接受出價，商品已成功鎖定";
export const SYSTEM_OFFER_ACCEPTED_BUYER_PAY_MERCHANT_SUFFIX =
  "；請完成託管付款以完成交易。";
export const SYSTEM_OFFER_ACCEPTED_SELLER_WAIT_MERCHANT_SUFFIX =
  "；待買家完成付款完成交易。";
export const SYSTEM_OFFER_ACCEPTED_BUYER_PAY_AUTH_SUFFIX =
  "；請完成託管付款以啟動鑑定流程。";
export const SYSTEM_OFFER_ACCEPTED_SELLER_WAIT_AUTH_SUFFIX =
  "；待買家完成付款以啟動鑑定流程。";

/** Buyer-facing default for inbox / system bubbles when payment context is unknown. */
export const SYSTEM_OFFER_ACCEPTED_TEXT = SYSTEM_OFFER_ACCEPTED_BUYER_BASE;

export type OfferAcceptedStatusSuffix =
  | "merchant_payment"
  | "auth_payment"
  | "none";

export function resolveOfferAcceptedCardStatusText(options: {
  isSeller: boolean;
  suffix: OfferAcceptedStatusSuffix;
}): string {
  const base = options.isSeller
    ? SYSTEM_OFFER_ACCEPTED_SELLER_BASE
    : SYSTEM_OFFER_ACCEPTED_BUYER_BASE;

  if (options.suffix === "merchant_payment") {
    return options.isSeller
      ? `${base}${SYSTEM_OFFER_ACCEPTED_SELLER_WAIT_MERCHANT_SUFFIX}`
      : `${base}${SYSTEM_OFFER_ACCEPTED_BUYER_PAY_MERCHANT_SUFFIX}`;
  }

  if (options.suffix === "auth_payment") {
    return options.isSeller
      ? `${base}${SYSTEM_OFFER_ACCEPTED_SELLER_WAIT_AUTH_SUFFIX}`
      : `${base}${SYSTEM_OFFER_ACCEPTED_BUYER_PAY_AUTH_SUFFIX}`;
  }

  return base;
}

export function resolveSystemOfferAcceptedText(isSeller: boolean): string {
  return isSeller
    ? SYSTEM_OFFER_ACCEPTED_SELLER_BASE
    : SYSTEM_OFFER_ACCEPTED_BUYER_BASE;
}

export function isSystemOfferAcceptedText(text: string): boolean {
  return (
    text === SYSTEM_OFFER_ACCEPTED_BUYER_BASE ||
    text === SYSTEM_OFFER_ACCEPTED_SELLER_BASE
  );
}

export const SYSTEM_OFFER_REJECTED_BUYER_TEXT = "賣家已拒絕此出價";
export const SYSTEM_OFFER_REJECTED_SELLER_TEXT = "你已拒絕此出價";

/** Buyer-facing default for inbox previews when viewer role is unknown. */
export const SYSTEM_OFFER_REJECTED_TEXT = SYSTEM_OFFER_REJECTED_BUYER_TEXT;

export function resolveSystemOfferRejectedText(isSeller: boolean): string {
  return isSeller
    ? SYSTEM_OFFER_REJECTED_SELLER_TEXT
    : SYSTEM_OFFER_REJECTED_BUYER_TEXT;
}

export function isSystemOfferRejectedText(text: string): boolean {
  return (
    text === SYSTEM_OFFER_REJECTED_BUYER_TEXT ||
    text === SYSTEM_OFFER_REJECTED_SELLER_TEXT
  );
}

export const SYSTEM_OFFER_CANCELLED_TEXT = "此筆出價已取消";

export const SYSTEM_ORDER_CANCELLED_TEXT = "此筆訂單已取消";
