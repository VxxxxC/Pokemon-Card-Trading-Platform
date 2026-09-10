import type { Tables } from "@/types/supabase";
import { formatMemberOrderDateTime } from "@/app/lib/member-order/p2p";
import type { FpsPayoutRequestStatus } from "@/lib/admin-payouts/types";

export type MemberSellerPayoutStatus =
  Tables<"member_orders">["seller_payout_status"];

export function normalizeMemberFpsPayoutRequestStatus(
  status: string | null | undefined,
): FpsPayoutRequestStatus | null {
  if (
    status === "pending" ||
    status === "ready" ||
    status === "processing" ||
    status === "completed" ||
    status === "failed"
  ) {
    return status;
  }
  return null;
}

export function formatMemberFpsPayoutRequestStatusLabel(
  status: FpsPayoutRequestStatus,
): string {
  switch (status) {
    case "pending":
      return "待補充 FPS";
    case "ready":
      return "待撥款";
    case "processing":
      return "撥款處理中";
    case "completed":
      return "已撥款";
    case "failed":
      return "撥款失敗";
    default:
      return status;
  }
}

export function getMemberFpsPayoutRequestBadgeClass(
  status: FpsPayoutRequestStatus,
): string {
  switch (status) {
    case "completed":
      return "border-success/30 bg-success/10 text-success";
    case "failed":
      return "border-warning/30 bg-warning/10 text-warning";
    case "ready":
    case "processing":
      return "border-brand/30 bg-brand/10 text-brand";
    default:
      return "border-white/10 bg-white/5 text-text-secondary";
  }
}

export function resolveMemberSellerPayoutSurface(
  sellerPayoutStatus: MemberSellerPayoutStatus | undefined,
  fpsPayoutRequestStatus?: FpsPayoutRequestStatus | null,
): { label: string; badgeClass: string } | null {
  if (fpsPayoutRequestStatus) {
    return {
      label: formatMemberFpsPayoutRequestStatusLabel(fpsPayoutRequestStatus),
      badgeClass: getMemberFpsPayoutRequestBadgeClass(fpsPayoutRequestStatus),
    };
  }

  if (!sellerPayoutStatus || sellerPayoutStatus === "none") {
    return null;
  }

  return {
    label: formatSellerPayoutStatusLabel(sellerPayoutStatus),
    badgeClass: getSellerPayoutStatusBadgeClass(sellerPayoutStatus),
  };
}

export function formatSellerPayoutStatusLabel(
  status: MemberSellerPayoutStatus,
): string {
  switch (status) {
    case "none":
      return "尚未開始";
    case "held":
      return "款項保留中（T+3）";
    case "ready":
      return "待撥款";
    case "processing":
      return "撥款處理中";
    case "paid":
      return "已撥款";
    case "frozen":
      return "撥款凍結";
    case "failed":
      return "撥款失敗";
    default:
      return status;
  }
}

export function getSellerPayoutStatusBadgeClass(
  status: MemberSellerPayoutStatus,
): string {
  switch (status) {
    case "paid":
      return "border-success/30 bg-success/10 text-success";
    case "frozen":
    case "failed":
      return "border-warning/30 bg-warning/10 text-warning";
    case "processing":
    case "ready":
      return "border-brand/30 bg-brand/10 text-brand";
    case "held":
      return "border-brand/20 bg-brand/5 text-brand";
    default:
      return "border-white/10 bg-white/5 text-text-secondary";
  }
}

export function formatSellerPayoutHoldUntilLabel(
  payoutHoldUntil: string | null | undefined,
): string | null {
  if (!payoutHoldUntil) {
    return null;
  }
  return formatMemberOrderDateTime(payoutHoldUntil);
}

/** Display ID for seller FPS payout ledger (admin PO-* rows). */
export function formatAuthPayoutDisplayId(
  orderNumber: string | null | undefined,
  orderId?: string,
  payoutId?: string | null,
): string {
  if (payoutId) {
    return payoutId;
  }
  if (orderNumber) {
    return `PO-${orderNumber.replace("ORD-", "")}`;
  }
  if (orderId) {
    return `PO-${orderId.slice(0, 8).toUpperCase()}`;
  }
  return "—";
}
