import {
  REPORT_CATEGORY_CONFIG,
  type ReportCategorySlug,
} from "@/lib/moderation/category-config";
import type { ModerationCaseStatus } from "@/lib/moderation/types";
import { formatHongKongDateTimeSlash } from "@/lib/datetime/hong-kong";

export type ModerationSeverityBand = "critical" | "medium" | "low";

export function deriveSeverityBand(finalScore: number | null): ModerationSeverityBand {
  const score = finalScore ?? 0;
  if (score >= 60) {
    return "critical";
  }
  if (score >= 30) {
    return "medium";
  }
  return "low";
}

export function formatCategoryLabel(
  slug: ReportCategorySlug | null | undefined,
): string {
  if (!slug) {
    return "未分類";
  }
  return REPORT_CATEGORY_CONFIG[slug]?.label ?? slug;
}

export function moderationStatusLabel(status: ModerationCaseStatus): string {
  switch (status) {
    case "open":
      return "待處理";
    case "reviewing":
      return "審核中";
    case "resolved":
      return "已裁定";
    case "dismissed":
      return "已駁回";
    default:
      return status;
  }
}

export function mapModerationStatusToUiTab(
  status: ModerationCaseStatus,
): "pending" | "completed" {
  if (status === "open" || status === "reviewing") {
    return "pending";
  }
  return "completed";
}

export function severityLabel(band: ModerationSeverityBand): string {
  switch (band) {
    case "critical":
      return "嚴重";
    case "medium":
      return "中等";
    default:
      return "輕微";
  }
}

export function severityBadgeClasses(band: ModerationSeverityBand): string {
  switch (band) {
    case "critical":
      return "bg-[rgba(239,68,68,0.12)] text-[#ef4444] border-[#ef4444]/20";
    case "medium":
      return "bg-[rgba(245,158,11,0.12)] text-[#f59e0b] border-[#f59e0b]/20";
    default:
      return "bg-[#2e2925] text-[#d4c4b7] border-white/10";
  }
}

export function moderationStatusBadgeClasses(
  status: ModerationCaseStatus,
): string {
  if (status === "open" || status === "reviewing") {
    return "bg-[rgba(245,158,11,0.12)] text-[#f59e0b] border-[#f59e0b]/20";
  }
  if (status === "resolved") {
    return "bg-[rgba(16,185,129,0.12)] text-[#10b981] border-[#10b981]/20";
  }
  return "bg-[#2e2925] text-[#d4c4b7] border-white/10";
}

export function categoryBadgeClasses(
  slug: ReportCategorySlug | null | undefined,
): string {
  switch (slug) {
    case "fraud":
      return "bg-[rgba(239,68,68,0.12)] text-[#ef4444] border-[#ef4444]/20";
    case "offline_trade":
      return "bg-[rgba(16,185,129,0.10)] text-[#10b981] border-[#10b981]/20";
    case "harassment":
      return "bg-[rgba(212,165,116,0.15)] text-[#d4a574] border-[#d4a574]/20";
    default:
      return "bg-[#2e2925] text-[#d4c4b7] border-white/10";
  }
}

export function formatModerationDateTime(value: string | null | undefined): string {
  return formatHongKongDateTimeSlash(value);
}

export function moderationAuditActionLabel(action: string): string {
  switch (action) {
    case "view_chat":
      return "調閱聊天紀錄";
    case "adjust_score":
      return "調整風控分數";
    case "apply_sanction":
      return "套用帳戶制裁";
    case "resolve":
      return "裁定結案";
    case "prepare_order_refund":
      return "準備售後退款";
    case "finalize_order_refund":
      return "完成售後退款";
    case "refund_failed":
      return "售後退款失敗";
    default:
      return action;
  }
}

export function moderationRefundStatusLabel(
  status: string | null | undefined,
): string {
  switch (status?.toLowerCase()) {
    case "processing":
      return "退款處理中";
    case "failed":
      return "退款失敗";
    case "refunded":
      return "已退款";
    case "none":
      return "未退款";
    default:
      return status ?? "—";
  }
}

export function moderationResolutionLabel(
  resolution: string | null | undefined,
): string {
  switch (resolution) {
    case "upheld":
      return "裁定成立";
    case "dismissed":
      return "駁回舉報";
    case "insufficient_evidence":
      return "證據不足";
    default:
      return resolution ?? "—";
  }
}

export function sanctionHistoryStatusLabel(
  status: "active" | "expired",
): string {
  return status === "expired" ? "已過期" : "生效中";
}

export function sanctionTypeLabel(type: string | null | undefined): string {
  switch (type) {
    case "warn":
      return "警告";
    case "restrict_listing":
      return "限制上架";
    case "restrict_chat":
      return "限制聊天";
    case "freeze_payout":
      return "凍結出款";
    case "suspend":
      return "帳戶暫停";
    case "ban":
      return "永久封禁";
    default:
      return type ?? "—";
  }
}

export function sanctionScopeLabel(scope: string | null | undefined): string {
  switch (scope) {
    case "account":
      return "全帳戶";
    case "member_persona":
      return "Member 身分";
    case "merchant_persona":
      return "Merchant 身分";
    default:
      return scope ?? "—";
  }
}

export function moderationOrderPersonaLabel(
  persona: "member" | "merchant",
): string {
  return persona === "merchant" ? "Merchant 訂單" : "Member 訂單";
}

export function moderationOrderSourceLabel(
  source: string | null | undefined,
): string {
  switch (source) {
    case "report_context":
      return "舉報上下文";
    case "chat_message":
      return "聊天紀錄";
    case "party_match":
      return "雙方訂單";
    default:
      return source ?? "—";
  }
}

export function moderationMemberOrderStatusLabel(
  status: string | null | undefined,
): string {
  switch (status) {
    case "pending":
      return "進行中";
    case "completed":
      return "已完成";
    case "cancelled":
      return "已取消";
    default:
      return status ?? "—";
  }
}

export function moderationOrderEscrowLabel(
  escrowStatus: string | null | undefined,
  persona: "member" | "merchant",
): string {
  if (!escrowStatus) {
    return "—";
  }

  if (persona === "merchant") {
    switch (escrowStatus) {
      case "pending_payment":
        return "待買家付款";
      case "payment_held":
        return "款項已託管，待入庫";
      case "shipped":
        return "運送中";
      case "authenticating":
        return "鑑定中";
      case "authenticated":
        return "待買家確認收貨";
      case "completed_and_transferred":
        return "已完成";
      case "refunded":
        return "已退款";
      default:
        return escrowStatus;
    }
  }

  switch (escrowStatus) {
    case "payment":
      return "待買家付款";
    case "custody":
      return "待賣家寄送平台";
    case "grading":
      return "平台鑑定中";
    case "shipped":
      return "待買家確認收貨";
    case "released":
      return "款項已釋放";
    case "cancelled":
      return "已取消";
    default:
      return escrowStatus;
  }
}

export function moderationOrderRefundSummary(
  order: {
    refundEligible?: boolean;
    refundIneligibleReason?: string | null;
    refundStatus?: string | null;
  },
): string {
  if (order.refundEligible) {
    return "可執行售後退款";
  }
  if (order.refundIneligibleReason) {
    return `暫不可退 — ${order.refundIneligibleReason}`;
  }
  if (order.refundStatus) {
    return moderationRefundStatusLabel(order.refundStatus);
  }
  return "—";
}
