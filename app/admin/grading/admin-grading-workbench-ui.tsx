"use client";

import type { ReactNode } from "react";
import {
  CheckCircle2,
  XCircle,
} from "lucide-react";
import type {
  AdminGradingAuditRow,
  AdminGradingOrderKind,
  AdminGradingQueueRow,
  AdminGradingTab,
} from "@/app/actions/admin-grading";
import {
  BTN_OUTLINE_SM_CLASS,
  FILTER_CHIP_SM_CLASS,
} from "@/app/admin/campaigns/campaigns-ui";
import { formatHongKongDateTime } from "@/lib/datetime/hong-kong";
import { getStripeTransferDashboardUrl } from "@/lib/stripe/dashboard-urls";
import {
  DEFAULT_GRADING_OPTION_ID,
  isRawGradingOptionId,
} from "@/lib/grading/options";
import { resolveGradingOptionId } from "@/lib/grading/resolve-option-id";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SECTION_TITLE_CLASS } from "@/lib/ui/section-title-ui";

export const TAB_LABELS: Record<AdminGradingTab, string> = {
  awaiting_intake: "待入庫",
  grading: "鑑定中",
  awaiting_outbound: "待出庫",
  awaiting_settlement: "待追償／寄回",
  closed: "已結案／退款",
};

export type OrderKindFilter = "all" | AdminGradingOrderKind;

export const ORDER_KIND_LABELS: Record<OrderKindFilter, string> = {
  all: "全部來源",
  member: "Member C2C",
  merchant: "Merchant B2C",
};

export const BTN_BRAND_CLASS =
  "bg-brand text-bg-page hover:bg-brand-hover font-sans active:scale-[0.98]";

const INPUT_CLASS =
  "h-10 rounded-lg border border-white/10 bg-transparent px-3 text-[13px] text-text-primary placeholder:text-text-disabled focus-visible:border-brand/40 focus-visible:ring-2 focus-visible:ring-brand/40 outline-none";

export type GradingDecisionMode = "pass" | "fail";

export function formatAdminGradingEscrowStatus(
  status: string,
  orderKind: AdminGradingOrderKind,
): string {
  const memberLabels: Record<string, string> = {
    payment: "待付款",
    custody: "保管中",
    grading: "鑑定中",
    shipped: "已發貨",
    released: "已釋放",
    cancelled: "已取消",
  };

  const merchantLabels: Record<string, string> = {
    pending_payment: "待付款",
    payment_held: "待入庫",
    shipped: "運送中",
    authenticating: "鑑定中",
    authenticated: "待買家收貨",
    completed_and_transferred: "已完成",
    refunded: "已退款",
  };

  const labels = orderKind === "member" ? memberLabels : merchantLabels;
  return labels[status] ?? status;
}

export function formatDateTime(iso: string | null): string {
  return formatHongKongDateTime(iso);
}

export function formatProductName(row: AdminGradingQueueRow): string {
  return (
    row.product_name_zh?.trim() ||
    row.product_name_ja?.trim() ||
    row.product_name_en?.trim() ||
    "—"
  );
}

export function formatParty(row: AdminGradingQueueRow): string {
  if (row.order_kind === "merchant") {
    return row.shop_name?.trim() || "商戶";
  }
  return row.seller_display_name?.trim() || row.seller_username || "賣家";
}

export function formatRefundPreview(row: AdminGradingQueueRow): string {
  const authFee = Number(row.auth_fee ?? 0);
  const buyerTotal = Number(row.buyer_total_amount ?? row.total_amount ?? 0);
  if (row.escrow_capture_model === "single" && buyerTotal > 0) {
    const released = Math.max(buyerTotal - authFee, 0);
    return `HK$ ${released.toLocaleString("zh-HK", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  }

  const base = Number(row.item_subtotal ?? 0);
  const inbound = Number(row.inbound_shipping_fee ?? 0);
  const outbound = Number(row.outbound_shipping_fee ?? 0);
  const shipping = Number(row.shipping_fee ?? 0);
  const released =
    inbound + outbound > 0 ? base + inbound + outbound : base + shipping;

  return `HK$ ${released.toLocaleString("zh-HK", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function formatAuthFeePreview(row: AdminGradingQueueRow): string {
  return `HK$ ${Number(row.auth_fee ?? 0).toLocaleString("zh-HK", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function isSingleCaptureGradingRow(row: AdminGradingQueueRow): boolean {
  return row.escrow_capture_model === "single";
}

export function formatBuyerTotalPreview(row: AdminGradingQueueRow): string {
  const total = Number(row.buyer_total_amount ?? row.total_amount ?? 0);
  return `HK$ ${total.toLocaleString("zh-HK", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function formatGradingFailWarning(row: AdminGradingQueueRow, faultParty: string): string {
  if (isSingleCaptureGradingRow(row) && faultParty === "buyer") {
    return `鑑定失敗（買家責任）：將扣除鑑定費 ${formatAuthFeePreview(row)}，其餘授權金額約 ${formatRefundPreview(row)} 釋放。`;
  }
  if (isSingleCaptureGradingRow(row)) {
    return `鑑定失敗將取消授權，買家全額退回（約 ${formatBuyerTotalPreview(row)}）。`;
  }
  return `鑑定失敗將釋放未扣款餘額（卡價+運費，約 ${formatRefundPreview(row)}）。舊版分階扣款訂單之鑑定費可能不退；單次授權訂單則取消授權並全額退回。`;
}

export function defaultPassGradingOptionId(row: AdminGradingQueueRow): string {
  const resolved = resolveGradingOptionId(row.grading_company, row.grading_score);
  if (!isRawGradingOptionId(resolved)) {
    return resolved;
  }
  return DEFAULT_GRADING_OPTION_ID;
}

export function formatListingGrade(row: AdminGradingQueueRow): string {
  const company = row.grading_company?.trim();
  const score = row.grading_score?.trim();
  if (!company) return "—";
  const companyLabel = company.toUpperCase() === "RAW" ? "裸卡" : company;
  return score ? `${companyLabel} ${score}` : companyLabel;
}

export function isSellerFaultGradingFail(row: AdminGradingQueueRow): boolean {
  return row.auth_result === "failed" && row.fault_party === "seller";
}

export function showSellerSettlementPanel(row: AdminGradingQueueRow): boolean {
  if (!isSellerFaultGradingFail(row)) {
    return false;
  }
  if (row.seller_settlement_status === "pending") {
    return true;
  }
  if (
    row.seller_settlement_status === "cleared" &&
    !row.outbound_tracking_no?.trim()
  ) {
    return true;
  }
  return false;
}

export function merchantRecoveryBlocksReturn(
  row: AdminGradingQueueRow,
): boolean {
  const progress = resolveMerchantRecoveryProgress(row);
  return (
    row.order_kind === "merchant" &&
    isSellerFaultGradingFail(row) &&
    progress != null &&
    progress.remaining > 0
  );
}

/** B2C: recovery fully applied; C2C: admin confirms FPS first. */
export function canAdminSubmitSellerReturn(row: AdminGradingQueueRow): boolean {
  if (!isSellerFaultGradingFail(row)) {
    return false;
  }
  if (merchantRecoveryBlocksReturn(row)) {
    return false;
  }
  return row.seller_settlement_status === "cleared";
}

export function isGradingSettlementStepComplete(
  row: AdminGradingQueueRow,
): boolean {
  if (!isSellerFaultGradingFail(row)) {
    return (
      formatDetailDisplay(row.refund_status) !== "—" ||
      formatDetailDisplay(row.fault_party) !== "—"
    );
  }

  if (row.order_kind === "merchant") {
    const progress = resolveMerchantRecoveryProgress(row);
    if (progress) {
      return progress.remaining <= 0;
    }
    return row.seller_settlement_status === "cleared";
  }

  return row.seller_settlement_status === "cleared";
}

export function formatRecoveryHkd(amount: number | null | undefined): string {
  if (amount == null || !Number.isFinite(Number(amount))) {
    return "—";
  }
  return Number(amount).toLocaleString("zh-HK", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function resolveMerchantRecoveryProgress(
  row: AdminGradingQueueRow,
): { total: number; applied: number; remaining: number } | null {
  if (row.order_kind !== "merchant") {
    return null;
  }

  const total = Number(row.recovery_total_hkd ?? row.receivable_amount_hkd ?? 0);
  const applied = Number(row.recovery_applied_hkd ?? 0);
  const remaining = Number(
    row.recovery_remaining_hkd ?? Math.max(0, total - applied),
  );

  if (total <= 0 && remaining <= 0) {
    return null;
  }

  return { total, applied, remaining };
}

export function recoveryStatusBadge(row: AdminGradingQueueRow): {
  label: string;
  className: string;
} | null {
  const merchant = resolveMerchantRecoveryProgress(row);
  if (merchant) {
    if (merchant.remaining <= 0) {
      return {
        label: "已扣清",
        className: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
      };
    }
    if (merchant.applied > 0) {
      return {
        label: "部分抵扣",
        className: "bg-amber-500/10 text-amber-400 border-amber-500/20",
      };
    }
    return {
      label: "欠款中",
      className: "bg-warning/10 text-warning border-warning/30",
    };
  }

  if (
    row.order_kind === "member" &&
    row.receivable_amount_hkd != null &&
    row.seller_settlement_status === "pending"
  ) {
    return {
      label: "待收款",
      className: "bg-amber-500/10 text-amber-400 border-amber-500/20",
    };
  }

  return null;
}

export function showMerchantRecoveryTrackingPanel(
  row: AdminGradingQueueRow,
): boolean {
  const progress = resolveMerchantRecoveryProgress(row);
  if (!progress) {
    return false;
  }
  return (
    progress.remaining > 0 &&
    row.seller_settlement_status === "cleared" &&
    Boolean(row.outbound_tracking_no?.trim())
  );
}

export function refundStatusBadge(row: AdminGradingQueueRow): {
  label: string;
  className: string;
} | null {
  if (row.refund_status === "refunded") {
    return {
      label: "已退款",
      className:
        "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    };
  }
  if (row.refund_status === "processing") {
    return {
      label: "處理中",
      className: "bg-amber-500/10 text-amber-400 border-amber-500/20",
    };
  }
  return null;
}

export function GradingDecisionToggle({
  mode,
  onChange,
}: {
  mode: GradingDecisionMode;
  onChange: (mode: GradingDecisionMode) => void;
}) {
  return (
    <div
      className="grid grid-cols-2 rounded-lg border border-white/10 bg-bg-page/50 p-1"
      role="tablist"
      aria-label="鑑定結果"
    >
      <button
        type="button"
        role="tab"
        aria-selected={mode === "pass"}
        onClick={() => onChange("pass")}
        className={`inline-flex h-8 items-center justify-center gap-1.5 rounded-md font-sans text-[12px] font-semibold transition-all active:scale-[0.98] ${
          mode === "pass"
            ? "bg-brand text-[#17130f] shadow-sm"
            : "text-text-secondary hover:text-text-primary"
        }`}
      >
        <CheckCircle2 className="size-3.5 shrink-0" aria-hidden="true" />
        通過
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={mode === "fail"}
        onClick={() => onChange("fail")}
        className={`inline-flex h-8 items-center justify-center gap-1.5 rounded-md font-sans text-[12px] font-semibold transition-all active:scale-[0.98] ${
          mode === "fail"
            ? "bg-warning/20 text-warning"
            : "text-text-secondary hover:text-warning"
        }`}
      >
        <XCircle className="size-3.5 shrink-0" aria-hidden="true" />
        失敗
      </button>
    </div>
  );
}

export function formatFlowTimelineAction(action: string): string {
  const labels: Record<string, string> = {
    recovery_opened: "開立追償欠款",
    recovery_applied: "Connect 撥款抵扣",
    receivable_opened: "開立 FPS 追償",
    receivable_paid: "FPS 追償已確認",
    clear_seller_settlement: "追償已入賬，允許寄回",
    submit_seller_return_tracking: "提交寄回賣家物流",
    confirm_intake: "確認入庫",
    fail_grading_void: "鑑定失敗並釋放餘額",
    prepare_fail_void: "準備鑑定失敗退款",
    pass_grading: "鑑定通過",
    submit_grading_outbound: "提交出庫物流",
  };
  return labels[action] ?? action;
}

export function resolveFlowTimelineActor(entry: AdminGradingAuditRow): string {
  if (entry.event_source === "ledger") {
    return "system · Connect 撥款";
  }
  if (entry.event_source === "receivable" && entry.action === "receivable_opened") {
    return "system · 追償";
  }
  return (
    entry.admin_display_name ?? entry.admin_username ?? "admin"
  );
}

export function formatFlowTimelineHeadline(entry: AdminGradingAuditRow): string {
  const label = formatFlowTimelineAction(entry.action);
  if (entry.event_source === "audit") {
    const fromStatus = formatDetailDisplay(entry.from_status);
    const toStatus = formatDetailDisplay(entry.to_status);
    if (fromStatus !== "—" || toStatus !== "—") {
      return `${label} · ${fromStatus} → ${toStatus}`;
    }
  }
  if (entry.amount_hkd != null && entry.amount_hkd > 0) {
    return `${label} · HK$ ${formatRecoveryHkd(entry.amount_hkd)}`;
  }
  return label;
}

export function GradingFlowTimelineEntry({ entry }: { entry: AdminGradingAuditRow }) {
  const isSystem =
    entry.event_source === "ledger" ||
    (entry.event_source === "receivable" &&
      entry.action === "receivable_opened");
  const transferId = entry.stripe_transfer_id?.trim() ?? "";
  const showStripeRef =
    entry.action === "recovery_applied" &&
    (transferId.length > 0 ||
      Boolean(entry.source_payout_order_number) ||
      Boolean(entry.source_payment_intent_id));

  return (
    <div
      className={`rounded-lg border px-3 py-2.5 ${
        isSystem
          ? "border-brand/15 bg-brand/5"
          : "border-white/[0.06] bg-transparent"
      }`}
    >
      <p className="font-mono text-[10px] text-text-disabled">
        {formatDateTime(entry.created_at)}
      </p>
      <p className="mt-1 font-sans text-[12px] text-text-primary">
        {formatFlowTimelineHeadline(entry)}
      </p>
      <p className="mt-0.5 font-sans text-[11px] text-text-secondary">
        {resolveFlowTimelineActor(entry)}
      </p>
      {entry.notes ? (
        <p className="mt-1 font-sans text-[12px] text-text-secondary">
          {entry.notes}
        </p>
      ) : null}
      {showStripeRef ? (
        <p className="mt-1 font-mono text-[11px] text-text-secondary">
          {transferId.startsWith("tr_") ? (
            <>
              Transfer{" "}
              <a
                href={getStripeTransferDashboardUrl(transferId)}
                target="_blank"
                rel="noopener noreferrer"
                className="text-brand hover:underline"
              >
                {transferId}
              </a>
            </>
          ) : transferId.length > 0 ? (
            <>Transfer {transferId}</>
          ) : null}
          {!transferId && entry.source_payout_order_number ? (
            <>來源撥款訂單 {entry.source_payout_order_number}</>
          ) : null}
          {entry.source_payment_intent_id ? (
            <>
              {transferId || entry.source_payout_order_number ? " · " : null}
              PI {entry.source_payment_intent_id}
            </>
          ) : null}
        </p>
      ) : null}
    </div>
  );
}

export function GradingQueueMobileCard({
  row,
  onOpen,
}: {
  row: AdminGradingQueueRow;
  onOpen: () => void;
}) {
  const refundBadge = refundStatusBadge(row);
  const recoveryBadge = recoveryStatusBadge(row);

  return (
    <article className="space-y-2 px-1 py-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-mono text-[13px] font-medium text-text-primary">
            {row.order_number ?? row.order_id.slice(0, 8)}
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <Badge
              variant="outline"
              className={
                row.order_kind === "member"
                  ? "border-brand/25 bg-brand/10 text-brand"
                  : "border-white/10 bg-bg-elevated text-text-secondary"
              }
            >
              {row.order_kind === "member" ? "C2C" : "B2C"}
            </Badge>
            {refundBadge ? (
              <Badge variant="outline" className={refundBadge.className}>
                {refundBadge.label}
              </Badge>
            ) : null}
            {recoveryBadge ? (
              <Badge variant="outline" className={recoveryBadge.className}>
                {recoveryBadge.label}
              </Badge>
            ) : null}
          </div>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onOpen}
          className={BTN_OUTLINE_SM_CLASS}
        >
          處理
        </Button>
      </div>

      <dl className="grid grid-cols-[4.5rem_1fr] gap-x-2 gap-y-1 font-sans text-[12px]">
        <dt className="text-text-disabled">買家</dt>
        <dd className="truncate text-text-primary">
          {row.buyer_display_name ?? row.buyer_username ?? "—"}
        </dd>
        <dt className="text-text-disabled">賣方</dt>
        <dd className="truncate text-text-primary">{formatParty(row)}</dd>
        <dt className="text-text-disabled">商品</dt>
        <dd className="truncate text-text-primary">{formatProductName(row)}</dd>
        <dt className="text-text-disabled">入庫</dt>
        <dd className="truncate font-mono text-[11px] text-text-secondary">
          {row.inbound_tracking_no ?? "—"}
        </dd>
        {resolveMerchantRecoveryProgress(row) ? (
          <>
            <dt className="text-text-disabled">追償</dt>
            <dd className="font-mono text-[11px] text-brand">
              欠 HK$ {formatRecoveryHkd(row.recovery_remaining_hkd)}
            </dd>
          </>
        ) : null}
      </dl>
    </article>
  );
}

export function RecoveryTableCell({ row }: { row: AdminGradingQueueRow }) {
  const badge = recoveryStatusBadge(row);
  const progress = resolveMerchantRecoveryProgress(row);

  if (!badge || !progress) {
    return <span className="font-sans text-[11px] text-text-disabled">—</span>;
  }

  return (
    <div className="space-y-1">
      <Badge variant="outline" className={badge.className}>
        {badge.label}
      </Badge>
      <p className="font-mono text-[10px] text-text-secondary">
        已扣 {formatRecoveryHkd(progress.applied)} / 欠{" "}
        {formatRecoveryHkd(progress.remaining)}
      </p>
    </div>
  );
}

export function RecoveryProgressDetail({
  row,
  compact = false,
}: {
  row: AdminGradingQueueRow;
  compact?: boolean;
}) {
  const badge = recoveryStatusBadge(row);
  const merchant = resolveMerchantRecoveryProgress(row);

  if (merchant) {
    return (
      <div className="space-y-2">
        {badge ? (
          <Badge variant="outline" className={badge.className}>
            {badge.label}
          </Badge>
        ) : null}
        <dl className="space-y-1 font-mono text-[12px] text-text-secondary">
          <div className="flex justify-between gap-3">
            <dt>追償總額</dt>
            <dd className="text-text-primary">HK$ {formatRecoveryHkd(merchant.total)}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt>已抵扣</dt>
            <dd className="text-brand">HK$ {formatRecoveryHkd(merchant.applied)}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt>尚欠</dt>
            <dd className="font-semibold text-warning">
              HK$ {formatRecoveryHkd(merchant.remaining)}
            </dd>
          </div>
        </dl>
        {!compact ? (
          <p className="font-sans text-[11px] leading-relaxed text-text-disabled">
            欠款將於商戶下一筆 Connect 撥款（T+7）自動 FIFO 抵扣；部分抵扣後餘額保留至後續訂單。
          </p>
        ) : null}
      </div>
    );
  }

  if (row.receivable_amount_hkd == null) {
    return null;
  }

  return (
    <p className="font-mono text-[12px] font-semibold text-brand">
      追償金額 HK$ {formatRecoveryHkd(row.receivable_amount_hkd)}
    </p>
  );
}

export function FilterChipRow<K extends string>({
  options,
  active,
  onSelect,
}: {
  options: { key: K; label: string; count: number }[];
  active: K;
  onSelect: (key: K) => void;
}) {
  return (
    <div
      className="min-w-0 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      <div className="flex gap-1 pb-0.5">
          {options.map(({ key, label: optionLabel, count }) => {
            const selected = active === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => onSelect(key)}
                className={`${FILTER_CHIP_SM_CLASS(selected)} shrink-0 gap-1`}
              >
                <span>{optionLabel}</span>
                <span
                  className={`font-mono text-[9px] tabular-nums ${
                    selected ? "text-brand/80" : "text-text-disabled"
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>
    </div>
  );
}

export function cnSelectClass(extra?: string) {
  return [INPUT_CLASS, extra].filter(Boolean).join(" ");
}

export function cnInputClass(extra?: string) {
  return [INPUT_CLASS, "w-full", extra].filter(Boolean).join(" ");
}

export function cnTextareaClass(extra?: string) {
  return [
    INPUT_CLASS,
    "min-h-[80px] w-full py-2 resize-y",
    extra,
  ]
    .filter(Boolean)
    .join(" ");
}

export function cnBtnBrand(extra?: string) {
  return [BTN_BRAND_CLASS, extra].filter(Boolean).join(" ");
}

export function formatDetailDisplay(value: string | null | undefined): string {
  const trimmed = value?.trim();
  if (!trimmed || trimmed === "—" || trimmed === "none" || trimmed === "null") {
    return "—";
  }
  return trimmed;
}

export function DetailValue({
  value,
  mono = false,
}: {
  value: string | null | undefined;
  mono?: boolean;
}) {
  const display = formatDetailDisplay(value);
  if (display === "—") {
    return <DetailEmptyValue />;
  }
  return (
    <span className={mono ? "font-mono text-[12px]" : undefined}>{display}</span>
  );
}

export function DetailInline({
  label,
  children,
  className,
  compact = false,
}: {
  label: string;
  children: ReactNode;
  className?: string;
  compact?: boolean;
}) {
  return (
    <div
      className={`flex min-w-0 items-center py-0.5 ${
        compact ? "gap-1" : "gap-2"
      } ${className ?? ""}`}
    >
      <span
        className={`shrink-0 whitespace-nowrap font-sans text-text-disabled ${
          compact ? "text-[10px]" : "text-[11px]"
        } ${compact ? "" : "w-[4.5rem]"}`}
      >
        {label}
      </span>
      <div
        className={`min-w-0 flex-1 truncate text-text-primary ${
          compact ? "text-[12px]" : "text-[13px]"
        }`}
      >
        {children}
      </div>
    </div>
  );
}

export function DetailEmptyValue() {
  return <span className="text-text-disabled">—</span>;
}

type TimelineStepStatus = "complete" | "active" | "pending";

export function GradingOrderTimeline({
  row,
  currentTab,
}: {
  row: AdminGradingQueueRow;
  currentTab: AdminGradingTab;
}) {
  const intakeComplete =
    Boolean(row.platform_received_at?.trim()) ||
    Boolean(row.inbound_tracking_no?.trim());
  const gradingComplete =
    Boolean(row.auth_graded_at?.trim()) ||
    (Boolean(row.auth_result?.trim()) &&
      formatDetailDisplay(row.auth_result) !== "—");
  const outboundComplete = Boolean(row.outbound_tracking_no?.trim());
  const settlementComplete = isGradingSettlementStepComplete(row);

  const activeId =
    currentTab === "awaiting_intake"
      ? "intake"
      : currentTab === "grading"
        ? "grading"
        : currentTab === "awaiting_outbound"
          ? "outbound"
          : "settlement";

  const steps: {
    id: string;
    label: string;
    complete: boolean;
    detail: ReactNode;
  }[] = [
    {
      id: "intake",
      label: "入庫",
      complete: intakeComplete,
      detail: intakeComplete ? (
        <span className="font-mono text-[10px] text-text-secondary">
          {formatDetailDisplay(row.inbound_tracking_no)}
        </span>
      ) : (
        <span className="text-[10px] text-text-disabled">待確認</span>
      ),
    },
    {
      id: "grading",
      label: "鑑定",
      complete: gradingComplete,
      detail: gradingComplete ? (
        <div className="flex flex-col items-center gap-0.5">
          <span className="text-[10px] text-text-secondary">
            {formatDetailDisplay(row.auth_result)}
          </span>
          {row.auth_grading_company ? (
            <GradingBadge
              grade={`${row.auth_grading_company}${
                row.auth_grading_score ? ` ${row.auth_grading_score}` : ""
              }`}
            />
          ) : null}
        </div>
      ) : (
        <span className="text-[10px] text-text-disabled">待鑑定</span>
      ),
    },
    {
      id: "outbound",
      label: "出庫",
      complete: outboundComplete,
      detail: outboundComplete ? (
        <span className="font-mono text-[10px] text-text-secondary">
          {formatDetailDisplay(row.outbound_tracking_no)}
        </span>
      ) : (
        <span className="text-[10px] text-text-disabled">待出庫</span>
      ),
    },
    {
      id: "settlement",
      label: "款項",
      complete: settlementComplete,
      detail: <SettlementTimelineDetail row={row} />,
    },
  ];

  return (
    <section className="border-t border-white/[0.08] pt-3">
      <h3 className="mb-3 font-sans text-[11px] font-semibold uppercase tracking-wide text-text-disabled">
        流程狀態
      </h3>
      <div className="grid grid-cols-4 gap-1">
        {steps.map((step, index) => {
          const status: TimelineStepStatus = step.complete
            ? "complete"
            : step.id === activeId
              ? "active"
              : "pending";

          return (
            <div key={step.id} className="flex min-w-0 flex-col items-center">
              <div className="flex w-full items-center">
                {index > 0 ? (
                  <div
                    className={`h-px flex-1 ${step.complete || status === "active" ? "bg-brand/40" : "bg-white/10"}`}
                    aria-hidden="true"
                  />
                ) : null}
                <div
                  className={`flex size-6 shrink-0 items-center justify-center rounded-full border text-[10px] font-bold ${
                    status === "complete"
                      ? "border-success/40 bg-success/15 text-success"
                      : status === "active"
                        ? "animate-ring-pulse border-brand/50 bg-brand/15 text-brand"
                        : "border-white/15 bg-transparent text-text-disabled"
                  }`}
                >
                  {status === "complete" ? "✓" : index + 1}
                </div>
                {index < steps.length - 1 ? (
                  <div
                    className={`h-px flex-1 ${steps[index + 1].complete || steps[index + 1].id === activeId ? "bg-brand/40" : "bg-white/10"}`}
                    aria-hidden="true"
                  />
                ) : null}
              </div>
              <span
                className={`mt-2 font-sans text-[11px] ${status === "active" ? "font-semibold text-brand" : "text-text-secondary"}`}
              >
                {step.label}
              </span>
              <div className="mt-0.5 max-w-full px-1 text-center">{step.detail}</div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export function SettlementTimelineDetail({ row }: { row: AdminGradingQueueRow }) {
  const recoveryBadge = recoveryStatusBadge(row);
  const refundBadge = refundStatusBadge(row);
  const settlement = row.seller_settlement_status;

  if (
    !recoveryBadge &&
    !refundBadge &&
    formatDetailDisplay(settlement) === "—" &&
    formatDetailDisplay(row.fault_party) === "—" &&
    row.receivable_amount_hkd == null
  ) {
    return <span className="text-[10px] text-text-disabled">待結算</span>;
  }

  const label =
    recoveryBadge?.label ??
    refundBadge?.label ??
    (settlement === "cleared" ? "已入賬" : null) ??
    (settlement === "pending" ? "待收款" : null) ??
    "已處理";

  return <span className="text-[10px] text-text-secondary">{label}</span>;
}

export function GradingBadge({ grade }: { grade: string }) {
  if (grade === "—") {
    return <span>—</span>;
  }
  return (
    <span
      className="inline-flex rounded-md bg-brand/15 px-2 py-0.5 font-mono text-[12px] font-medium text-text-primary"
    >
      {grade}
    </span>
  );
}

export function ActionPanel({
  title,
  children,
  compact = false,
}: {
  title: string;
  children: ReactNode;
  compact?: boolean;
}) {
  if (compact) {
    return (
      <section className="flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.08] pt-3">
        <h3 className={SECTION_TITLE_CLASS}>
          {title}
        </h3>
        {children}
      </section>
    );
  }

  return (
    <section className="space-y-3 border-t border-white/[0.08] pt-4">
      <h3 className={SECTION_TITLE_CLASS}>
        {title}
      </h3>
      <div className="space-y-3">{children}</div>
    </section>
  );
}
