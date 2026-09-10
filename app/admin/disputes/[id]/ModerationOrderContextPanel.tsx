"use client";

import Link from "next/link";
import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { MerchantB2cDirectTimeline } from "@/app/components/merchant/MerchantB2cDirectTimeline";
import { MemberAuthOrderTimeline } from "@/app/components/user/MemberAuthOrderTimeline";
import { MemberP2pOrderTimeline } from "@/app/components/user/MemberP2pOrderTimeline";
import type { MemberOrderDbStatus } from "@/app/lib/member-order/p2p";
import type { MemberEscrowStatus } from "@/app/lib/member-order/auth-escrow";
import {
  formatModerationDateTime,
  moderationMemberOrderStatusLabel,
  moderationOrderEscrowLabel,
  moderationOrderPersonaLabel,
  moderationOrderRefundSummary,
  moderationOrderSourceLabel,
} from "@/lib/moderation/admin-case-presenters";
import { Button } from "@/components/ui/button";
import { BTN_OUTLINE_CLASS, SECTION_BLOCK_CLASS, SECTION_TITLE_CLASS, META_TEXT_CLASS, EXPANDED_CONTENT_CLASS } from "./moderation-detail-ui";
import type {
  AdminModerationOrderSummary,
  ReportCategorySlug,
} from "@/lib/moderation/types";
import type { Tables } from "@/types/supabase";

type ModerationOrderContextPanelProps = {
  relatedOrders: AdminModerationOrderSummary[];
  primaryCategory: ReportCategorySlug | null;
  caseId?: string;
  caseOpen?: boolean;
  isRetryPending?: boolean;
  onRetryRefund?: (orderId: string) => void;
};

function orderDetailHref(order: AdminModerationOrderSummary): string {
  if (order.persona === "merchant") {
    return `/profile/merchant/orderDetail/${order.id}`;
  }
  return `/profile/user/orderDetail/${order.id}`;
}

function MemberOrderTimeline({
  order,
}: {
  order: AdminModerationOrderSummary;
}) {
  if (order.useAuthentication) {
    return (
      <MemberAuthOrderTimeline
        status={order.status as MemberOrderDbStatus | null}
        escrowStatus={order.escrowStatus as MemberEscrowStatus | null}
        paymentConfirmedAt={order.paidAt}
      />
    );
  }

  return (
    <MemberP2pOrderTimeline status={order.status as MemberOrderDbStatus | null} />
  );
}

function OrderDetailRow({
  label,
  value,
  hint,
  valueClassName,
}: {
  label: string;
  value: string;
  hint?: string;
  valueClassName?: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 font-sans text-[12px]">
      <span className={META_TEXT_CLASS}>{label}</span>
      <span className="min-w-0 text-right">
        <span
          className={
            valueClassName ??
            "font-sans text-[12px] text-text-secondary"
          }
        >
          {value}
        </span>
        {hint ? (
          <span className="mt-0.5 block font-sans text-[11px] text-text-disabled">
            {hint}
          </span>
        ) : null}
      </span>
    </div>
  );
}

function OrderContextCard({
  order,
  defaultOpen,
  caseOpen,
  caseId,
  isRetryPending,
  onRetryRefund,
}: {
  order: AdminModerationOrderSummary;
  defaultOpen: boolean;
  caseOpen: boolean;
  caseId?: string;
  isRetryPending: boolean;
  onRetryRefund?: (orderId: string) => void;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="border-b border-white/[0.06] last:border-b-0">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-start gap-2 py-2.5 text-left transition-colors hover:text-text-primary active:scale-[0.99]"
        aria-expanded={open}
      >
        <div className="min-w-0 flex-1">
          <span className="font-mono text-[13px] font-semibold text-text-primary">
            {order.orderNumber ?? order.id.slice(0, 8)}
          </span>
        </div>
        <ChevronDown
          className={`mt-0.5 size-4 shrink-0 text-text-disabled transition-transform ${
            open ? "rotate-180" : ""
          }`}
          aria-hidden="true"
        />
      </button>

      {open ? (
        <div className={`${EXPANDED_CONTENT_CLASS} space-y-3`}>
          <dl className="space-y-1.5">
            <OrderDetailRow
              label="訂單類型"
              value={moderationOrderPersonaLabel(order.persona)}
            />
            {order.source ? (
              <OrderDetailRow
                label="關聯來源"
                value={moderationOrderSourceLabel(order.source)}
              />
            ) : null}
            <OrderDetailRow
              label="訂單金額"
              value={`HK$${order.finalPrice}`}
              hint={
                order.totalAmount != null &&
                order.totalAmount !== order.finalPrice
                  ? `含運費共 HK$${order.totalAmount}`
                  : undefined
              }
            />
            <OrderDetailRow
              label="交易階段"
              value={moderationOrderEscrowLabel(
                order.escrowStatus,
                order.persona,
              )}
            />
            <OrderDetailRow
              label="訂單狀態"
              value={moderationMemberOrderStatusLabel(order.status)}
            />
            {order.inboundTrackingNo ? (
              <OrderDetailRow
                label="入庫物流"
                value={order.inboundTrackingNo}
              />
            ) : null}
            {order.outboundTrackingNo ? (
              <OrderDetailRow
                label="出庫物流"
                value={order.outboundTrackingNo}
              />
            ) : null}
            {order.createdAt ? (
              <OrderDetailRow
                label="建立時間"
                value={formatModerationDateTime(order.createdAt)}
              />
            ) : null}
            {order.refundWindowEndsAt ? (
              <OrderDetailRow
                label="退款期限"
                value={formatModerationDateTime(order.refundWindowEndsAt)}
              />
            ) : null}
            <OrderDetailRow
              label="售後退款"
              value={moderationOrderRefundSummary(order)}
              valueClassName={
                order.refundEligible
                  ? "font-sans text-[12px] text-success"
                  : "font-sans text-[12px] text-text-secondary"
              }
            />
          </dl>

          {!caseOpen &&
          caseId &&
          onRetryRefund &&
          ["processing", "failed"].includes(
            (order.refundStatus ?? "").toLowerCase(),
          ) ? (
            <Button
              type="button"
              variant="outline"
              disabled={isRetryPending}
              onClick={() => onRetryRefund(order.id)}
              className={`h-9 ${BTN_OUTLINE_CLASS}`}
            >
              {isRetryPending ? "重試中…" : "重試退款"}
            </Button>
          ) : null}

          <div className="flex justify-end">
            <Link
              href={orderDetailHref(order)}
              target="_blank"
              rel="noreferrer"
              className="font-sans text-[12px] text-brand underline"
            >
              在新分頁開啟訂單詳情
            </Link>
          </div>

          {order.persona === "member" ? (
            <MemberOrderTimeline order={order} />
          ) : (
            <MerchantB2cDirectTimeline
              escrowStatus={
                order.escrowStatus as Tables<"merchant_orders">["escrow_status"]
              }
              perspective="seller"
            />
          )}
        </div>
      ) : null}
    </div>
  );
}

export default function ModerationOrderContextPanel({
  relatedOrders,
  primaryCategory,
  caseId,
  caseOpen = true,
  isRetryPending = false,
  onRetryRefund,
}: ModerationOrderContextPanelProps) {
  const showPanel =
    relatedOrders.length > 0 ||
    primaryCategory === "fraud" ||
    primaryCategory === "offline_trade";

  if (!showPanel) {
    return null;
  }

  const defaultExpandSingle = relatedOrders.length === 1;

  return (
    <section className={SECTION_BLOCK_CLASS}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className={SECTION_TITLE_CLASS}>關聯訂單</h2>
        {relatedOrders.length > 0 ? (
          <span className={META_TEXT_CLASS}>共 {relatedOrders.length} 筆</span>
        ) : null}
      </div>

      {relatedOrders.length === 0 ? (
        <p className="font-sans text-[12px] text-text-disabled">
          {primaryCategory === "offline_trade"
            ? "無平台訂單 — 符合私下交易風險特徵。"
            : "暫無關聯訂單紀錄。"}
        </p>
      ) : (
        <div className="divide-y divide-white/[0.06]">
          {relatedOrders.map((order) => (
            <OrderContextCard
              key={`${order.persona}-${order.id}`}
              order={order}
              defaultOpen={defaultExpandSingle}
              caseOpen={caseOpen}
              caseId={caseId}
              isRetryPending={isRetryPending}
              onRetryRefund={onRetryRefund}
            />
          ))}
        </div>
      )}
    </section>
  );
}
