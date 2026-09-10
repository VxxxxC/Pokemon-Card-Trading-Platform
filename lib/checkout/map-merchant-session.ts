import type { MerchantCheckoutOrder } from "@/app/actions/merchant-checkout";
import type {
  CheckoutSession,
  MerchantAuthCheckoutSession,
  MerchantDirectCheckoutSession,
} from "@/lib/checkout/types";

export function mapMerchantCheckoutToSession(
  order: MerchantCheckoutOrder,
): CheckoutSession {
  const base = {
    orderKind: "merchant" as const,
    orderId: order.orderId,
    orderNumber: order.orderNumber,
    listingId: order.listingId,
    isPayable: order.isPayable,
    paymentExpiresAt: order.paymentExpiresAt,
    product: order.product,
    counterparty: {
      name: order.merchant.shopName,
      handle: order.merchant.shopHandle,
    },
    pricing: {
      itemSubtotal: order.itemSubtotal,
      shippingFee: order.requiresAuthentication ? 0 : order.shippingFee,
      inboundShippingFee: order.inboundShippingFee,
      outboundShippingFee: order.outboundShippingFee,
      authFee: order.authFee,
      totalAmount: order.totalAmount,
    },
    platformAuthFeeHkd: order.platformAuthFeeHkd,
  };

  if (order.requiresAuthentication) {
    const session: MerchantAuthCheckoutSession = {
      ...base,
      variant: "merchant_auth",
    };
    return session;
  }

  const session: MerchantDirectCheckoutSession = {
    ...base,
    variant: "merchant_direct",
    shippingMethod: order.shippingMethod,
    listingAcceptsAuthentication: order.listingAcceptsAuthentication,
    requiresAuthentication: order.requiresAuthentication,
    baseCourierShippingFee: order.baseCourierShippingFee,
    listingExtraShippingFee: order.listingExtraShippingFee,
    courierShippingFeeQuote: order.courierShippingFeeQuote,
  };
  return session;
}
