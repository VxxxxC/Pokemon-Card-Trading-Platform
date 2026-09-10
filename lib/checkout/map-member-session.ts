import type { MemberAuthCheckoutOrder } from "@/app/actions/member-auth-checkout";
import type { MemberAuthCheckoutSession } from "@/lib/checkout/types";

export function mapMemberCheckoutToSession(
  order: MemberAuthCheckoutOrder,
): MemberAuthCheckoutSession {
  return {
    variant: "member_auth",
    orderKind: "member",
    orderId: order.orderId,
    orderNumber: order.orderNumber,
    listingId: order.listingId,
    isPayable: order.isPayable,
    paymentExpiresAt: null,
    product: order.product,
    counterparty: {
      name: order.seller.displayName,
      handle: order.seller.username,
    },
    pricing: {
      itemSubtotal: order.itemSubtotal,
      shippingFee: 0,
      inboundShippingFee: order.inboundShippingFee,
      outboundShippingFee: order.outboundShippingFee,
      authFee: order.authFee,
      totalAmount: order.buyerTotalAmount,
    },
    platformAuthFeeHkd: order.platformAuthFeeHkd,
  };
}
