import type {
  MerchantOrderDetail,
  MerchantTradingOrder,
} from "@/app/actions/orders";
import type { OrderStatus, SaleOrder } from "@/app/lib/types/trading";
import { isMerchantOrderBuyerConfirmed } from "@/lib/merchant-order/display-status";
import type { Tables } from "@/types/supabase";
import { formatTradeGradeLabel } from "@/lib/marketplace/listing-display";

type MerchantEscrowStatus = NonNullable<
  Tables<"merchant_orders">["escrow_status"]
>;

export function mapMerchantEscrowToOrderStatus(
  escrowStatus: MerchantEscrowStatus | null,
  buyerConfirmedAt?: string | null,
): OrderStatus {
  if (isMerchantOrderBuyerConfirmed({ buyerConfirmedAt })) {
    return "released";
  }

  switch (escrowStatus) {
    case "refunded":
      return "cancelled";
    case "completed_and_transferred":
      return "released";
    case "authenticating":
      return "grading";
    case "authenticated":
      return "shipped";
    case "shipped":
      return "shipped";
    case "payment_held":
      return "payment";
    case "pending_payment":
      return "payment";
    default:
      return "payment";
  }
}

/** Status badge / list label overrides by escrow + order kind. */
export function resolveMerchantStatusLabelOverride(
  escrowStatus: MerchantEscrowStatus | null,
  requiresAuthentication?: boolean | null,
  shippingMethod?: string | null,
  payoutStatus?: string | null,
): string | undefined {
  if (payoutStatus === "held" || payoutStatus === "processing") {
    return "款項保留中";
  }
  if (escrowStatus === "pending_payment") {
    return "待買家付款";
  }
  if (escrowStatus === "payment_held" && !requiresAuthentication) {
    return shippingMethod === "meetup" ? "待面交" : "待發貨";
  }
  if (escrowStatus === "shipped") {
    return "運送中";
  }
  if (escrowStatus === "authenticating") {
    return "鑑定中";
  }
  if (escrowStatus === "authenticated") {
    return "待買家收貨";
  }
  return undefined;
}

function formatListingGrade(order: MerchantTradingOrder): string {
  const { gradingCompany, gradingScore } = order.listing;
  return formatTradeGradeLabel(gradingCompany, gradingScore);
}

function formatOrderDateTime(createdAt: string | null): string {
  if (!createdAt) {
    return "";
  }
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) {
    return createdAt;
  }
  return date.toLocaleString("zh-TW", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export function mapMerchantTradingOrderToSaleOrder(
  order: MerchantTradingOrder,
): SaleOrder {
  return {
    id: order.id,
    orderNumber: order.orderNumber ?? undefined,
    buyerId: order.buyerId,
    buyerName: order.buyer.displayName,
    sellerId: order.merchantId,
    sellerName: "",
    cardName: order.product.cardName,
    cardNo: order.product.cardNumber ?? order.product.displayId ?? "",
    grade: formatListingGrade(order),
    amount: order.finalPrice,
    status: mapMerchantEscrowToOrderStatus(
      order.escrowStatus,
      order.buyerConfirmedAt,
    ),
    statusLabelOverride: resolveMerchantStatusLabelOverride(
      order.escrowStatus,
      order.requiresAuthentication,
      order.shippingMethod,
      order.payoutStatus,
    ),
    createdAt: formatOrderDateTime(order.createdAt),
    orderType: "B2C",
    userContext: "SELLER",
    productListingId: order.id,
    hasAuthenticationToggle: Boolean(order.requiresAuthentication),
  };
}

export function mapMerchantOrderDetailToSaleOrder(
  detail: MerchantOrderDetail,
): SaleOrder {
  const base = mapMerchantTradingOrderToSaleOrder(detail);

  return {
    ...base,
    orderNumber: detail.orderNumber ?? undefined,
    productListingId: detail.listingId,
    trackingNo: detail.inboundTrackingNo ?? detail.logisticsProofPath ?? undefined,
    avatarSeed: detail.buyer.id,
    statusLabelOverride: resolveMerchantStatusLabelOverride(
      detail.escrowStatus,
      detail.requiresAuthentication,
      detail.shippingMethod,
      detail.payoutStatus,
    ),
  };
}
