export function buildAbsoluteUrl(siteUrl: string, path: string): string {
  const base = siteUrl.replace(/\/$/, "");
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${base}${normalizedPath}`;
}

export function buildMemberTradingUrl(siteUrl: string): string {
  return buildAbsoluteUrl(siteUrl, "/profile/user/trading");
}

export function buildMerchantTradingUrl(siteUrl: string): string {
  return buildAbsoluteUrl(siteUrl, "/profile/merchant/trading");
}

export function buildSellerTradingUrl(
  siteUrl: string,
  sellerPersona: "merchant" | "member",
): string {
  return sellerPersona === "merchant"
    ? buildMerchantTradingUrl(siteUrl)
    : buildMemberTradingUrl(siteUrl);
}

export function buildBuyerOrderDetailUrl(siteUrl: string, orderId: string): string {
  return buildAbsoluteUrl(siteUrl, `/profile/user/orderDetail/${orderId}`);
}

export function buildMerchantOrderDetailUrl(siteUrl: string, orderId: string): string {
  return buildAbsoluteUrl(siteUrl, `/profile/merchant/orderDetail/${orderId}`);
}

export function buildSellerOrderDetailUrl(
  siteUrl: string,
  orderId: string,
  sellerPersona: "merchant" | "member",
): string {
  return sellerPersona === "merchant"
    ? buildMerchantOrderDetailUrl(siteUrl, orderId)
    : buildBuyerOrderDetailUrl(siteUrl, orderId);
}

export function buildMerchantFinanceUrl(siteUrl: string): string {
  return buildAbsoluteUrl(siteUrl, "/profile/merchant/finance");
}
