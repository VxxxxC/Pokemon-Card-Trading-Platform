import type { UserTradingOrder } from "@/app/actions/orders";
import type { SaleOrder, OrderStatus } from "@/app/lib/types/trading";
import type { MemberEscrowStatus } from "@/app/lib/member-order/auth-escrow";
import { formatTradeGradeLabel } from "@/lib/marketplace/listing-display";

function mapAuthOrderStatus(
  dbStatus: UserTradingOrder["status"],
  escrowStatus: MemberEscrowStatus | null,
): OrderStatus {
  if (dbStatus === "cancelled") {
    return "cancelled";
  }

  if (dbStatus === "completed") {
    return "released";
  }

  if (
    escrowStatus === "payment" ||
    escrowStatus === "custody" ||
    escrowStatus === "grading" ||
    escrowStatus === "shipped" ||
    escrowStatus === "released"
  ) {
    return escrowStatus;
  }

  return "payment";
}

function formatListingGrade(order: UserTradingOrder): string {
  const { gradingCompany, gradingScore } = order.listing;
  return formatTradeGradeLabel(gradingCompany, gradingScore);
}

/** Overview / list rows without explicit statusBadge — avoid mislabeling P2P meetup as 已付款. */
export function resolveUserTradingStatusLabelOverride(
  order: UserTradingOrder,
): string | undefined {
  if (order.pendingPayment) {
    return order.persona === "sell" ? "待買家付款" : "待付款";
  }

  if (
    !order.useAuthentication &&
    (order.status === "pending" || order.status === "meetup_arranged")
  ) {
    return "待處理";
  }

  if (
    order.useAuthentication &&
    order.status === "pending" &&
    order.escrowStatus === "payment" &&
    !order.paymentConfirmedAt
  ) {
    return "待付款";
  }

  return undefined;
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

export function mapTradingOrderToSaleOrder(order: UserTradingOrder): SaleOrder {
  const isBuyer = order.persona === "buy";
  const counterpartyName = order.counterparty.displayName;
  const p2pStatus: OrderStatus =
    order.status === "cancelled"
      ? "cancelled"
      : order.status === "completed"
        ? "released"
        : "payment";

  return {
    id: order.id,
    buyerId: order.buyerId,
    buyerName: isBuyer ? "" : counterpartyName,
    sellerId: order.sellerId,
    sellerName: isBuyer ? counterpartyName : "",
    cardName: order.product.cardName,
    cardNo: order.product.cardNumber ?? order.product.displayId ?? "",
    grade: formatListingGrade(order),
    amount: order.finalPrice,
    status: order.useAuthentication
      ? mapAuthOrderStatus(order.status, order.escrowStatus)
      : p2pStatus,
    createdAt: formatOrderDateTime(order.createdAt),
    orderType: order.orderKind === "merchant" ? "B2C" : "C2C",
    userContext: isBuyer ? "BUYER" : "SELLER",
    productListingId: order.id,
    hasAuthenticationToggle: order.useAuthentication,
    statusLabelOverride: resolveUserTradingStatusLabelOverride(order),
  };
}
