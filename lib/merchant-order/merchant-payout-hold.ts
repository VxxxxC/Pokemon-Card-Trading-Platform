import { formatMemberOrderDateTime } from "@/app/lib/member-order/p2p";

export function formatMerchantPayoutStatusLabel(status: string | null | undefined): string {
  switch (status) {
    case "pending":
      return "尚未開始";
    case "held":
      return "款項保留中（T+7）";
    case "processing":
      return "撥款處理中";
    case "paid":
      return "已撥至 Connect";
    case "frozen":
      return "撥款凍結";
    case "failed":
      return "撥款失敗";
    default:
      return status ?? "";
  }
}

export function formatMerchantPayoutHoldUntilLabel(
  payoutHoldUntil: string | null | undefined,
): string | null {
  if (!payoutHoldUntil) {
    return null;
  }
  return formatMemberOrderDateTime(payoutHoldUntil);
}

export const MERCHANT_CONNECT_T7_PAYOUT_POLICY_TEXT =
  "買家確認收貨後，款項將保留 7 日作售後保障；期滿後平台會透過 Stripe 自動撥款至你的Stripe Connect 帳戶。";

export function resolveMerchantTransferDisplayLabel(input: {
  stripeTransferId?: string | null;
  payoutStatus?: string | null;
  escrowStatus?: string | null;
}): { label: string; showT7PolicyTooltip: boolean } {
  if (input.stripeTransferId) {
    return { label: input.stripeTransferId, showT7PolicyTooltip: false };
  }
  if (
    input.payoutStatus === "held" ||
    input.payoutStatus === "processing"
  ) {
    return { label: "待 T+7 後撥款", showT7PolicyTooltip: true };
  }
  if (input.escrowStatus === "completed_and_transferred") {
    return { label: "—", showT7PolicyTooltip: false };
  }
  return { label: "待買家確認後撥款", showT7PolicyTooltip: true };
}
