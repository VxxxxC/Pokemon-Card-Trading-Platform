"use client";

import { useState, type ReactNode } from "react";
import { CreditCard, PenLine, XCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  cancelMemberOrder,
  completeBuyerOrder,
} from "@/app/actions/orders";
import type { MemberOrderKind } from "@/lib/member-order/order-kind";
import { MemberOrderCompleteConfirmDialog } from "@/app/components/user/MemberOrderCompleteConfirmDialog";
import { usePaymentCountdown } from "@/app/lib/hooks/usePaymentCountdown";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import {
  SaleOrder,
  OrderStatus,
  STATUS_STEP_INDEX,
} from "@/app/lib/types/trading";
import { ESCROW_STEPS } from "@/app/lib/types/rbac";
import type { MemberEscrowStatus } from "@/app/lib/member-order/auth-escrow";
import { CertifiedMerchantBadge } from "@/app/components/profile/CertifiedMerchantBadge";

interface UserOrderRowProps {
  order: SaleOrder;
  statusBadge?: ReactNode;
  orderNumber?: string | null;
  detailOrderId?: string;
  variant?: "default" | "embedded";
  onOpenReview?: (orderId: string, revieweeId: string) => void;
  dbOrderContext?: {
    orderKind?: MemberOrderKind;
    orderId: string;
    revieweeId: string;
    dbStatus: string;
    hasReviewedByMe: boolean;
    useAuthentication?: boolean;
    escrowStatus?: MemberEscrowStatus | null;
    canPay?: boolean;
    pendingPayment?: boolean;
    paymentExpiresAt?: string | null;
    canCompleteMerchantPurchase?: boolean;
    canCancel: boolean;
    onRefresh: () => void;
  };
}

function formatOrderNumberLabel(orderNumber: string): string {
  const compact = orderNumber.replace(/^#/, "").trim();
  if (!compact) {
    return "";
  }
  if (/^ORD-/i.test(compact) || compact.length <= 24) {
    return compact;
  }
  return `${compact.slice(0, 8)}…${compact.slice(-8)}`;
}

export const ORDER_ROW_CHIP_BASE =
  "inline-flex items-center shrink-0 font-mono text-[10px] font-semibold leading-none px-2 py-0.5 rounded-full border";

export const ORDER_ROW_CHIP_TONES = {
  buy: "font-medium text-[#8A8680] bg-white/[0.03] border-white/[0.06]",
  sell: "text-warning bg-warning/10 border-warning/25",
  warning: "text-warning bg-warning/10 border-warning/25",
  blue: "text-[#3b9eff] bg-[#3b9eff]/10 border-[#3b9eff]/25",
  brand: "text-brand bg-brand/10 border-brand/25",
  success: "text-success bg-success/10 border-success/25",
  grading: "text-purple-400 bg-purple-500/10 border-purple-500/25",
  muted: "text-text-secondary bg-bg-elevated border-white/10",
  destructive: "text-destructive bg-destructive/10 border-destructive/25",
} as const;

export function OrderRowChip({
  children,
  tone,
  className,
}: {
  children: ReactNode;
  tone?: keyof typeof ORDER_ROW_CHIP_TONES;
  className?: string;
}) {
  return (
    <span
      className={cn(
        ORDER_ROW_CHIP_BASE,
        tone ? ORDER_ROW_CHIP_TONES[tone] : null,
        className,
      )}
    >
      {children}
    </span>
  );
}

function OrderStatusBadge({
  status,
  labelOverride,
  toneOverride,
}: {
  status: OrderStatus;
  labelOverride?: string;
  toneOverride?: keyof typeof ORDER_ROW_CHIP_TONES;
}) {
  const stepIdx =
    STATUS_STEP_INDEX[status as Exclude<OrderStatus, "cancelled">];
  const step = stepIdx !== undefined ? ESCROW_STEPS[stepIdx] : null;
  const toneMap: Record<OrderStatus, keyof typeof ORDER_ROW_CHIP_TONES> = {
    payment: "warning",
    custody: "brand",
    shipped: "blue",
    grading: "success",
    released: "muted",
    cancelled: "muted",
  };
  return (
    <OrderRowChip tone={toneOverride ?? toneMap[status] ?? "muted"}>
      {status === "cancelled"
        ? "已取消"
        : (labelOverride ?? step?.label ?? status)}
    </OrderRowChip>
  );
}

const orderRowActionBtnClass =
  "w-full h-9 font-sans text-[11px] font-semibold rounded-lg transition-all active:scale-[0.98] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1.5";

export const ORDER_ROW_ACTION_TONES = {
  payment:
    "bg-brand text-[#1A1612] hover:bg-brand-hover border-0 shadow-none",
  complete:
    "bg-success text-white hover:bg-success-hover border-0 shadow-none",
  cancel:
    "bg-[rgba(239,68,68,0.10)] text-warning border border-warning/20 hover:bg-[rgba(239,68,68,0.18)]",
  review:
    "bg-brand text-[#1A1612] hover:bg-brand-hover border-0 shadow-none",
} as const;

const orderRowEmbeddedActionClass =
  "font-sans text-[10px] font-semibold px-2.5 py-1.5 rounded-md transition-all active:scale-[0.98] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed";

export function UserOrderRow({
  order,
  statusBadge,
  orderNumber,
  detailOrderId,
  variant = "default",
  onOpenReview,
  dbOrderContext,
}: UserOrderRowProps) {
  const router = useRouter();
  const [isActionLoading, setIsActionLoading] = useState(false);
  const displayOrderNumber = orderNumber?.trim() || null;
  const navigateOrderId = detailOrderId ?? order.id;

  const isBuyer = order.userContext === "BUYER";
  const showCertifiedMerchantBadge =
    isBuyer &&
    (order.orderType === "B2C" || dbOrderContext?.orderKind === "merchant");
  const counterpartLabel = isBuyer ? "賣家" : "買家";
  const counterpartName = isBuyer ? order.sellerName : order.buyerName;

  const isAuthOrder = Boolean(dbOrderContext?.useAuthentication);
  const isMerchantBuyerOrder =
    dbOrderContext?.orderKind === "merchant" && isBuyer;
  const isPendingDbOrder = dbOrderContext?.dbStatus === "pending";
  // B2C 訂單未完成 Stripe 託管付款前，唔可以確認收貨。
  const isPendingEscrowPayment = Boolean(dbOrderContext?.pendingPayment);
  const canCompleteOrder =
    isPendingDbOrder &&
    isBuyer &&
    !isPendingEscrowPayment &&
    (isMerchantBuyerOrder
      ? Boolean(dbOrderContext?.canCompleteMerchantPurchase)
      : !isAuthOrder);
  const canPayAuthOrder = Boolean(dbOrderContext?.canPay);
  const canCheckoutMerchantOrder = isPendingEscrowPayment && isBuyer;
  const { countdownLabel, isExpired, isExpiringSoon } = usePaymentCountdown(
    isPendingEscrowPayment ? dbOrderContext?.paymentExpiresAt : null,
  );
  const showCheckoutPaymentButton =
    isBuyer &&
    !isExpired &&
    (canCheckoutMerchantOrder || canPayAuthOrder);
  const showPendingActions =
    isPendingDbOrder &&
    (canCompleteOrder ||
      showCheckoutPaymentButton ||
      Boolean(dbOrderContext?.canCancel));
  const showReviewCta =
    dbOrderContext?.dbStatus === "completed" &&
    !dbOrderContext.hasReviewedByMe &&
    Boolean(onOpenReview);

  const paymentStatusBadgeLabel =
    isPendingEscrowPayment && isExpired
      ? "付款已過期"
      : dbOrderContext?.canPay || dbOrderContext?.pendingPayment
        ? "待付款"
        : order.statusLabelOverride;
  const paymentStatusBadgeTone: keyof typeof ORDER_ROW_CHIP_TONES | undefined =
    isPendingEscrowPayment && isExpired ? "buy" : undefined;

  const handleComplete = async (): Promise<boolean> => {
    if (!dbOrderContext || isActionLoading) {
      return false;
    }

    setIsActionLoading(true);
    const result = await completeBuyerOrder({
      orderKind: dbOrderContext.orderKind ?? "member",
      orderId: dbOrderContext.orderId,
    });
    setIsActionLoading(false);

    if (!result.success) {
      toast.error(result.error);
      return false;
    }

    toast.success("交易已確認完成！");
    dbOrderContext.onRefresh();

    if (onOpenReview) {
      const reviewOrderId = dbOrderContext.orderId;
      const revieweeId = dbOrderContext.revieweeId;
      window.setTimeout(() => {
        onOpenReview(reviewOrderId, revieweeId);
      }, 0);
    }

    return true;
  };

  const handleCancel = async () => {
    if (!dbOrderContext || isActionLoading) {
      return;
    }

    setIsActionLoading(true);
    const result = await cancelMemberOrder(dbOrderContext.orderId);
    setIsActionLoading(false);

    if (!result.success) {
      toast.error(result.error);
      return;
    }

    toast.success("交易已取消，商品已重新上架");
    dbOrderContext.onRefresh();
  };

  const handleOpenReview = () => {
    if (!dbOrderContext || !onOpenReview || isActionLoading) {
      return;
    }

    onOpenReview(dbOrderContext.orderId, dbOrderContext.revieweeId);
  };

  if (variant === "embedded") {
    return (
      <div
        onClick={() =>
          router.push("/profile/user/orderDetail/" + navigateOrderId)
        }
        className="py-2.5 px-3 cursor-pointer transition-colors hover:bg-bg-elevated/40 border-b border-[rgba(237,232,224,0.06)] last:border-b-0 animate-fadeIn"
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <OrderRowChip tone={isBuyer ? "buy" : "sell"}>
              {isBuyer ? "買入" : "賣出"}
            </OrderRowChip>
            {statusBadge ?? (
              <OrderStatusBadge
                status={order.status}
                labelOverride={paymentStatusBadgeLabel}
                toneOverride={paymentStatusBadgeTone}
              />
            )}
          </div>
          <div className="flex items-center gap-1.5 min-w-0 mt-1">
            <span className="text-[13px] font-semibold text-text-primary truncate">
              {order.cardName}
            </span>
            <span className="font-sans text-[9px] font-bold text-brand bg-brand/5 border border-brand/20 px-1 py-0.5 rounded shrink-0">
              {order.grade}
            </span>
          </div>
          <p className="flex items-center gap-1.5 min-w-0 text-[10px] text-text-disabled mt-0.5">
            <span className="truncate">
              {counterpartLabel}：{counterpartName}
            </span>
            {showCertifiedMerchantBadge ? (
              <CertifiedMerchantBadge
                className="shrink-0 scale-[0.92] origin-left"
              />
            ) : null}
          </p>
        </div>

        <div className="flex flex-col items-end gap-1.5 shrink-0">
          <span className="text-[14px] font-mono font-bold text-brand leading-none">
            {"HK$ " + order.amount.toLocaleString("zh-TW")}
          </span>
          {(showPendingActions || showReviewCta) && (
            <div
              className="flex flex-wrap justify-end gap-1"
              onClick={(event) => event.stopPropagation()}
            >
              {showPendingActions && showCheckoutPaymentButton && (
                <button
                  type="button"
                  disabled={isActionLoading}
                  onClick={() => router.push("/checkout/" + navigateOrderId)}
                  className={cn(
                    orderRowEmbeddedActionClass,
                    ORDER_ROW_ACTION_TONES.payment,
                  )}
                >
                  付款
                </button>
              )}
              {showPendingActions && canCompleteOrder && (
                <MemberOrderCompleteConfirmDialog
                  disabled={isActionLoading}
                  isActionLoading={isActionLoading}
                  onConfirm={handleComplete}
                  triggerClassName={cn(
                    orderRowEmbeddedActionClass,
                    ORDER_ROW_ACTION_TONES.complete,
                  )}
                />
              )}
              {showReviewCta && (
                <button
                  type="button"
                  data-testid="order-review-cta"
                  disabled={isActionLoading}
                  onClick={handleOpenReview}
                  className={cn(
                    orderRowEmbeddedActionClass,
                    ORDER_ROW_ACTION_TONES.review,
                  )}
                >
                  評價交易
                </button>
              )}
            </div>
          )}
        </div>
        </div>
        {displayOrderNumber || order.createdAt || (isPendingEscrowPayment && dbOrderContext?.paymentExpiresAt) ? (
          <div className="flex items-center justify-between gap-3 min-w-0 mt-1.5">
            <p className="font-mono text-[10px] text-text-disabled truncate min-w-0">
              {displayOrderNumber
                ? `訂單號碼 ${formatOrderNumberLabel(displayOrderNumber)}`
                : null}
              {isPendingEscrowPayment &&
              dbOrderContext?.paymentExpiresAt &&
              !isExpired ? (
                <span
                  className={cn(
                    displayOrderNumber ? "ml-1.5" : null,
                    isExpiringSoon ? "text-warning" : "text-text-disabled",
                  )}
                  suppressHydrationWarning
                >
                  {countdownLabel}
                </span>
              ) : null}
            </p>
            {order.createdAt ? (
              <span className="font-sans text-[10px] text-text-disabled/80 shrink-0 tabular-nums">
                {order.createdAt}
              </span>
            ) : null}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div
      onClick={() =>
        router.push("/profile/user/orderDetail/" + navigateOrderId)
      }
      className="rounded-lg border border-[rgba(237,232,224,0.08)] bg-bg-page/25 px-3 py-3.5 cursor-pointer transition-colors hover:bg-bg-elevated/40 animate-fadeIn"
    >
      <div className="flex items-center gap-3 min-w-0">
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex items-center gap-1.5 flex-wrap">
            <OrderRowChip tone={isBuyer ? "buy" : "sell"}>
              {isBuyer ? "買入" : "賣出"}
            </OrderRowChip>
            {statusBadge ?? (
              <OrderStatusBadge
                status={order.status}
                labelOverride={paymentStatusBadgeLabel}
                toneOverride={paymentStatusBadgeTone}
              />
            )}
          </div>

          <div className="flex items-center gap-2 min-w-0">
            <span className="text-[14px] font-semibold text-text-primary truncate leading-tight">
              {order.cardName}
            </span>
            <span className="font-sans text-[10px] font-bold text-brand bg-brand/5 border border-brand/20 px-1.5 py-0.5 rounded shrink-0">
              {order.grade}
            </span>
          </div>

          <p className="flex items-center gap-1.5 min-w-0 text-[11px] text-text-secondary leading-relaxed">
            <span className="truncate">
              {counterpartLabel}：{counterpartName}
            </span>
            {showCertifiedMerchantBadge ? (
              <CertifiedMerchantBadge
                className="shrink-0 scale-[0.92] origin-left"
              />
            ) : null}
          </p>
        </div>

        <div className="shrink-0">
          <span className="text-[15px] font-mono font-bold text-brand leading-none tabular-nums">
            {"HK$ " + order.amount.toLocaleString("zh-TW")}
          </span>
        </div>
      </div>

      {displayOrderNumber || order.createdAt || (isPendingEscrowPayment && dbOrderContext?.paymentExpiresAt) ? (
        <div className="flex items-center justify-between gap-3 min-w-0 mt-1.5">
          <p className="font-mono text-[10px] text-text-disabled truncate min-w-0">
            {displayOrderNumber
              ? `訂單號碼 ${formatOrderNumberLabel(displayOrderNumber)}`
              : null}
            {isPendingEscrowPayment &&
            dbOrderContext?.paymentExpiresAt &&
            !isExpired ? (
              <span
                className={cn(
                  displayOrderNumber ? "ml-1.5" : null,
                  isExpiringSoon ? "text-warning" : "text-text-disabled",
                )}
                suppressHydrationWarning
              >
                {countdownLabel}
              </span>
            ) : null}
          </p>
          {order.createdAt ? (
            <span className="font-sans text-[10px] text-text-disabled shrink-0 tabular-nums">
              {order.createdAt}
            </span>
          ) : null}
        </div>
      ) : null}

      {(showPendingActions || showReviewCta) && (
        <div
          className="flex flex-col gap-2 w-full mt-3 pt-3 border-t border-[rgba(237,232,224,0.06)]"
          onClick={(event) => event.stopPropagation()}
        >
          {showPendingActions && showCheckoutPaymentButton && (
            <button
              type="button"
              disabled={isActionLoading}
              onClick={() => router.push("/checkout/" + navigateOrderId)}
              className={cn(
                orderRowActionBtnClass,
                "px-3",
                ORDER_ROW_ACTION_TONES.payment,
              )}
            >
              <CreditCard className="size-3.5 shrink-0" aria-hidden />
              前往付款
            </button>
          )}
          {showPendingActions && canCompleteOrder && (
            <div className="w-full">
              <MemberOrderCompleteConfirmDialog
                disabled={isActionLoading}
                isActionLoading={isActionLoading}
                onConfirm={handleComplete}
                triggerClassName={cn(
                  orderRowActionBtnClass,
                  "px-3",
                  ORDER_ROW_ACTION_TONES.complete,
                )}
              />
            </div>
          )}
          {showPendingActions && dbOrderContext?.canCancel && (
            <AlertDialog>
              <AlertDialogTrigger
                disabled={isActionLoading}
                className={cn(
                  orderRowActionBtnClass,
                  "px-3",
                  ORDER_ROW_ACTION_TONES.cancel,
                )}
              >
                {isActionLoading ? (
                  "處理中…"
                ) : (
                  <>
                    <XCircle className="size-3.5 shrink-0" aria-hidden />
                    取消交易
                  </>
                )}
              </AlertDialogTrigger>
                <AlertDialogContent className="max-w-sm rounded-2xl border border-[#ef4444]/30 bg-[#26211C] p-6 text-[#eae1da]">
                  <AlertDialogHeader className="text-left">
                    <AlertDialogTitle className="text-[15px] font-black">
                      確認取消交易
                    </AlertDialogTitle>
                    <AlertDialogDescription className="text-[11px] font-mono uppercase tracking-wider text-[#8A8680]">
                      Cancel Order
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <p className="py-3 text-[12.5px] leading-relaxed text-[#d4c4b7]">
                    您即將取消與{" "}
                    <span className="font-bold text-brand">{counterpartName}</span>{" "}
                    的待處理訂單（
                    <span className="font-mono text-warning">
                      HK$ {order.amount.toLocaleString("zh-TW")}
                    </span>
                    ）。確認後商品將重新上架至市集。
                  </p>
                  <div className="flex flex-col gap-2">
                    <AlertDialogAction
                      onClick={() => void handleCancel()}
                      disabled={isActionLoading}
                      className="h-11 rounded-xl bg-[#ef4444] font-black text-white hover:bg-[#dc2626] disabled:opacity-50"
                    >
                      {isActionLoading ? "處理中…" : "確認取消"}
                    </AlertDialogAction>
                    <AlertDialogCancel className="h-10 rounded-xl border border-white/10 bg-[#120F0C]">
                      返回
                    </AlertDialogCancel>
                  </div>
                </AlertDialogContent>
              </AlertDialog>
            )}
          {showReviewCta && (
            <button
              type="button"
              data-testid="order-review-cta"
              disabled={isActionLoading}
              onClick={handleOpenReview}
              className={cn(
                orderRowActionBtnClass,
                "px-3",
                ORDER_ROW_ACTION_TONES.review,
              )}
            >
              <PenLine className="size-3.5 shrink-0" aria-hidden />
              評價交易
            </button>
          )}
        </div>
      )}
    </div>
  );
}
