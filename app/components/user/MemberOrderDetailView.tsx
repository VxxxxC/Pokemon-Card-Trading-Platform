"use client";

import React, { useState } from "react";
import { MessageSquareText } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  cancelMemberOrder,
  completeBuyerOrder,
  confirmBuyerReceived,
  submitInboundTracking,
  type MemberOrderDetail,
} from "@/app/actions/orders";
import { MemberOrderCompleteConfirmDialog } from "@/app/components/user/MemberOrderCompleteConfirmDialog";
import { FpsIdCollectDialog } from "@/app/components/user/FpsIdCollectDialog";
import { ProfileAvatar } from "@/app/components/profile/ProfileAvatar";
import { CertifiedMerchantBadge } from "@/app/components/profile/CertifiedMerchantBadge";
import { MemberAuthOrderInvoice } from "@/app/components/user/MemberAuthOrderInvoice";
import { MemberAuthOrderTimeline } from "@/app/components/user/MemberAuthOrderTimeline";
import { MemberMerchantB2cOrderInvoice } from "@/app/components/user/MemberMerchantB2cOrderInvoice";
import { MerchantAuthSellerTimeline } from "@/app/components/merchant/MerchantAuthSellerTimeline";
import { MerchantB2cDirectTimeline } from "@/app/components/merchant/MerchantB2cDirectTimeline";
import { usePaymentCountdown } from "@/app/lib/hooks/usePaymentCountdown";
import { MemberP2pOrderInvoice } from "@/app/components/user/MemberP2pOrderInvoice";
import { MemberP2pOrderTimeline } from "@/app/components/user/MemberP2pOrderTimeline";
import { ImageViewer } from "@/app/components/shared/ImageViewer";
import { SECTION_TITLE_CLASS } from "@/lib/ui/section-title-ui";
import { OrderCatalogThumb } from "@/app/components/shared/OrderCatalogThumb";
import { OrderListingPhotoGrid } from "@/app/components/shared/OrderListingPhotoGrid";
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
import {
  formatListingGrade,
  formatMemberOrderDateTime,
  isMeetupOnlyMemberOrder,
  isPendingMemberOrderStatus,
} from "@/app/lib/member-order/p2p";
import {
  formatAuthPayoutDisplayId,
  formatSellerPayoutHoldUntilLabel,
  resolveMemberSellerPayoutSurface,
} from "@/lib/member-order/seller-payout";
import { SellerReputationMeta } from "@/lib/marketplace/seller-reputation-meta";
import { resolveSellerProfilePath } from "@/lib/marketplace/seller-identity";
import {
  computeFpsGrossPayoutHkd,
  computeFpsNetPayoutAmount,
} from "@/lib/platform/fps-payout-config";
import {
  formatMerchantPayoutHoldUntilLabel,
  formatMerchantPayoutStatusLabel,
} from "@/lib/merchant-order/merchant-payout-hold";
import { shouldShowMerchantBuyerPayoutStatus } from "@/lib/merchant-order/display-status";
import { cn } from "@/lib/utils";

type MemberOrderDetailViewProps = {
  order: MemberOrderDetail;
  onRefresh: () => void;
  onOpenReview?: (orderId: string, revieweeId: string) => void;
};

function dispatchPortfolioRefresh(): void {
  if (typeof window === "undefined") {
    return;
  }
  window.dispatchEvent(new CustomEvent("inventory-should-refresh"));
  window.dispatchEvent(new CustomEvent("collection-should-refresh"));
}

function fpsCollectDismissStorageKey(sellerId: string): string {
  return `hkcv-fps-collect-dismissed-${sellerId}`;
}

function sellerNeedsFpsDetails(order: MemberOrderDetail): boolean {
  return (
    order.persona === "sell" &&
    order.useAuthentication &&
    (!order.sellerFpsId?.trim() || !order.sellerFpsName?.trim())
  );
}

const ORDER_DETAIL_CARD_CLASS =
  "rounded-lg border border-white/[0.08] bg-bg-card/20 p-4";

const ORDER_ALERT_CLASS =
  "rounded-lg border border-warning/30 bg-warning/10 p-3 space-y-2";

export function MemberOrderDetailView({
  order,
  onRefresh,
  onOpenReview,
}: MemberOrderDetailViewProps) {
  const router = useRouter();
  const [isActionLoading, setIsActionLoading] = useState(false);
  const [isViewerOpen, setIsViewerOpen] = useState(false);
  const [viewerIndex, setViewerIndex] = useState(0);

  const isSeller = order.persona === "sell";
  const isBuyer = !isSeller;
  const counterpartLabel = isBuyer ? "賣家" : "買家";
  const counterpartName = order.counterparty.displayName;
  const counterpartProfileHref = resolveSellerProfilePath({
    sellerId: order.counterparty.id,
    sellerUsername: order.counterparty.username,
    sellerPersona: order.orderKind === "merchant" ? "merchant" : "member",
  });
  const gradeLabel = formatListingGrade(order.listing);
  const cardMeta =
    (order.product.cardNumber ?? order.product.displayId ?? "—") +
    " · 等級: " +
    gradeLabel;
  const displayOrderNumber = order.orderNumber ?? order.id;
  const displayPayoutId =
    isSeller && order.useAuthentication
      ? formatAuthPayoutDisplayId(order.orderNumber, order.id)
      : null;
  const createdAtLabel = formatMemberOrderDateTime(order.createdAt);
  const useMerchantB2cEscrowUi = order.orderKind === "merchant";
  const useMeetupUi =
    isMeetupOnlyMemberOrder(order.useAuthentication) && !useMerchantB2cEscrowUi;
  const [inboundTrackingInput, setInboundTrackingInput] = useState("");
  const [inboundCourierInput, setInboundCourierInput] = useState("");
  const [fpsDialogOpen, setFpsDialogOpen] = useState(() => {
    if (typeof window === "undefined") {
      return false;
    }
    if (!sellerNeedsFpsDetails(order)) {
      return false;
    }
    return !sessionStorage.getItem(fpsCollectDismissStorageKey(order.sellerId));
  });

  const needsSellerFps = isSeller && sellerNeedsFpsDetails(order);
  const payoutHoldUntilLabel = formatSellerPayoutHoldUntilLabel(
    order.payoutHoldUntil,
  );
  const buyerConfirmedLabel = order.buyerConfirmedAt
    ? formatMemberOrderDateTime(order.buyerConfirmedAt)
    : null;
  const merchantPayoutHoldUntilLabel = formatMerchantPayoutHoldUntilLabel(
    order.payoutHoldUntil,
  );

  const handleFpsDialogOpenChange = (open: boolean) => {
    setFpsDialogOpen(open);
    if (!open && needsSellerFps && typeof window !== "undefined") {
      sessionStorage.setItem(
        fpsCollectDismissStorageKey(order.sellerId),
        "1",
      );
    }
  };

  const galleryImages =
    order.listingImageUrls.length > 0
      ? order.listingImageUrls
      : order.product.imageUrl
        ? [order.product.imageUrl]
        : [];

  const isPending = isPendingMemberOrderStatus(order.status);
  // B2C 託管訂單未完成 Stripe 付款前，唔可以確認收貨 / 進入交割流程。
  const isPendingEscrowPayment = order.pendingPayment;
  const { countdownLabel, isExpired, isExpiringSoon } = usePaymentCountdown(
    isPendingEscrowPayment ? order.paymentExpiresAt : null,
  );
  const isMerchantPaymentExpired =
    order.merchantEscrowStatus === "refunded" ||
    (isPendingEscrowPayment && isExpired);
  const showMerchantPendingPaymentBanner =
    isPendingEscrowPayment ||
    (order.orderKind === "merchant" &&
      order.merchantEscrowStatus === "refunded");
  const isMerchantBuyerOrder =
    order.orderKind === "merchant" && order.persona === "buy";
  const canCompletePurchase = isMerchantBuyerOrder
    ? Boolean(order.canCompleteMerchantPurchase)
    : isPending && !isPendingEscrowPayment;
  const showReviewCta =
    order.status === "completed" &&
    !order.hasReviewedByMe &&
    Boolean(onOpenReview);

  const handleComplete = async (): Promise<boolean> => {
    if (isActionLoading) {
      return false;
    }

    setIsActionLoading(true);
    const result = await completeBuyerOrder({
      orderKind: order.orderKind ?? "member",
      orderId: order.id,
    });
    setIsActionLoading(false);

    if (!result.success) {
      toast.error(result.error);
      return false;
    }

    toast.success("交易已確認完成！");
    dispatchPortfolioRefresh();
    onRefresh();

    if (onOpenReview) {
      const reviewOrderId = order.id;
      const revieweeId = order.counterparty.id;
      window.setTimeout(() => {
        onOpenReview(reviewOrderId, revieweeId);
      }, 0);
    }

    return true;
  };

  const handleCancel = async () => {
    if (isActionLoading) {
      return;
    }

    setIsActionLoading(true);
    const result = await cancelMemberOrder(order.id);
    setIsActionLoading(false);

    if (!result.success) {
      toast.error(result.error);
      return;
    }

    toast.success("交易已取消，商品已重新上架");
    dispatchPortfolioRefresh();
    onRefresh();
  };

  const handleSubmitInbound = async () => {
    if (isActionLoading) {
      return;
    }

    setIsActionLoading(true);
    const result = await submitInboundTracking(
      order.id,
      inboundTrackingInput,
      inboundCourierInput,
    );
    setIsActionLoading(false);

    if (!result.success) {
      toast.error(result.error);
      return;
    }

    toast.success("入庫物流單號已提交");
    onRefresh();
  };

  const handleConfirmReceipt = async (): Promise<boolean> => {
    if (isActionLoading) {
      return false;
    }

    setIsActionLoading(true);
    const result = await confirmBuyerReceived(order.id);
    setIsActionLoading(false);

    if (!result.success) {
      toast.error(result.error);
      return false;
    }

    toast.success("已確認收貨，交易完成！");
    dispatchPortfolioRefresh();
    onRefresh();

    if (onOpenReview) {
      onOpenReview(order.id, order.counterparty.id);
    }

    return true;
  };

  const handleOpenReview = () => {
    if (!onOpenReview || isActionLoading) {
      return;
    }

    onOpenReview(order.id, order.counterparty.id);
  };

  const showMerchantBuyerPayoutStatus =
    isBuyer &&
    order.orderKind === "merchant" &&
    shouldShowMerchantBuyerPayoutStatus(
      order.merchantPayoutStatus,
      order.pendingPayment,
    );
  const showSellerPayoutStatus =
    isSeller &&
    order.useAuthentication &&
    (order.sellerPayoutStatus || order.fpsPayoutRequestStatus);
  const sellerPayoutSurface =
    isSeller && order.useAuthentication
      ? resolveMemberSellerPayoutSurface(
          order.sellerPayoutStatus,
          order.fpsPayoutRequestStatus,
        )
      : null;

  return (
    <div className="mx-auto w-full max-w-2xl space-y-4 pb-6 animate-fadeIn">
      <FpsIdCollectDialog
        open={fpsDialogOpen}
        onOpenChange={handleFpsDialogOpenChange}
        initialFpsId={order.sellerFpsId}
        initialFpsName={order.sellerFpsName}
        onSaved={onRefresh}
      />

      <section
        className={`${ORDER_DETAIL_CARD_CLASS} space-y-4`}
        aria-label="訂單摘要"
      >
        <div className="flex flex-wrap items-center gap-1.5">
          <span
            className={cn(
              "inline-flex items-center rounded-md border px-2 py-0.5 font-sans text-[11px] font-medium",
              isSeller
                ? "border-warning/30 bg-warning/10 text-warning"
                : "border-sky-400/30 bg-sky-400/10 text-sky-400",
            )}
          >
            {isSeller ? "賣出交易" : "買入交易"}
          </span>
          {order.useAuthentication ? (
            <span className="inline-flex items-center rounded-md border border-brand/30 bg-brand/10 px-2 py-0.5 font-sans text-[11px] font-medium text-brand">
              鑑定訂單
            </span>
          ) : null}
        </div>

        <div className="space-y-3">
          <div className="min-w-0">
            <p className="font-sans text-[10px] text-text-disabled">訂單號碼</p>
            <h1
              className="truncate font-mono text-[18px] font-bold leading-tight text-text-primary sm:text-[20px]"
              title={displayOrderNumber}
            >
              {displayOrderNumber}
            </h1>
          </div>

          <div className="overflow-hidden rounded-lg bg-bg-page/25">
            <div className="flex items-center gap-3 px-3 py-2.5">
              <OrderCatalogThumb
                catalogImageUrl={order.product.catalogImageUrl}
                alt={order.product.cardName}
              />
              <div className="min-w-0 flex-1">
                <p className="truncate font-sans text-[15px] font-semibold text-text-primary">
                  {order.product.cardName}
                </p>
                <p className="mt-0.5 font-mono text-[11px] text-text-secondary">
                  {cardMeta}
                </p>
              </div>
            </div>

            <Link
              href={counterpartProfileHref}
              className="flex items-center gap-2 border-t border-white/[0.06] px-3 py-2 transition-colors hover:bg-bg-page/40"
              title={`${counterpartLabel}：${counterpartName}`}
            >
              <ProfileAvatar
                avatarUrl={order.counterparty.avatarUrl}
                displayName={counterpartName}
                className="h-7 w-7 shrink-0 border border-white/10"
                fallbackClassName="bg-[#17130f] text-brand text-[10px] font-bold"
              />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  <span className="font-sans text-[10px] text-text-disabled shrink-0">
                    {counterpartLabel}
                  </span>
                  <span className={`truncate ${SECTION_TITLE_CLASS}`}>
                    {counterpartName}
                  </span>
                  {isBuyer && order.orderKind === "merchant" ? (
                    <CertifiedMerchantBadge
                      className="shrink-0 scale-[0.92] origin-left"
                    />
                  ) : null}
                  <SellerReputationMeta
                    rating={order.counterparty.ratingScore ?? 0}
                    reviewCount={order.counterparty.publicReviewCount}
                    totalTrades={order.counterparty.completedTradesCount}
                  />
                </div>
              </div>
              <span
                className="shrink-0 font-sans text-[10px] text-brand"
                aria-hidden="true"
              >
                →
              </span>
            </Link>
          </div>
        </div>

        <dl
          className="grid gap-2 rounded-lg bg-bg-page/25 px-3 py-2.5 font-mono text-[11px] sm:grid-cols-2"
        >
          <div className="min-w-0">
            <dt className="text-text-disabled">上架序號</dt>
            <dd
              className="mt-0.5 break-all text-text-secondary"
              title={order.listingId}
            >
              {order.listingId}
            </dd>
            {createdAtLabel ? (
              <p className="mt-1 font-mono text-[10px] text-text-disabled">
                建立 {createdAtLabel}
              </p>
            ) : null}
          </div>
          {displayPayoutId ? (
            <div className="min-w-0 sm:col-span-2">
              <dt className="text-text-disabled">提現單號</dt>
              <dd className="mt-0.5 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className="break-all font-medium text-brand"
                    title={displayPayoutId}
                  >
                    {displayPayoutId}
                  </span>
                  {sellerPayoutSurface ? (
                    <span
                      className={cn(
                        "shrink-0 rounded border px-1.5 py-0.5 font-sans text-[10px] font-semibold",
                        sellerPayoutSurface.badgeClass,
                      )}
                    >
                      {sellerPayoutSurface.label}
                    </span>
                  ) : null}
                </div>
                {showSellerPayoutStatus && buyerConfirmedLabel ? (
                  <p className="text-[10px] text-text-disabled">
                    買家確認收貨：{buyerConfirmedLabel}
                  </p>
                ) : null}
                {showSellerPayoutStatus &&
                payoutHoldUntilLabel &&
                (order.sellerPayoutStatus === "held" ||
                  order.sellerPayoutStatus === "ready") ? (
                  <p className="text-[10px] text-text-disabled">
                    撥款解凍時間：{payoutHoldUntilLabel}
                  </p>
                ) : null}
                {showSellerPayoutStatus &&
                order.itemSubtotalAuth != null &&
                (order.sellerPayoutStatus === "held" ||
                  order.sellerPayoutStatus === "ready") ? (
                  <p className="text-[10px] text-text-disabled">
                    預計 FPS 到賬：HK${" "}
                    {computeFpsNetPayoutAmount(
                      computeFpsGrossPayoutHkd(
                        order.itemSubtotalAuth,
                        order.inboundShippingFeeAuth ?? 0,
                      ),
                    ).toLocaleString("zh-TW")}
                  </p>
                ) : null}
              </dd>
            </div>
          ) : null}
        </dl>

        {showMerchantBuyerPayoutStatus ? (
          <div className="space-y-1 rounded-lg border border-brand/15 bg-brand/5 px-3 py-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="font-sans text-[11px] text-text-disabled">
                撥款狀態
              </span>
              <span className="font-sans text-[12px] font-semibold text-brand">
                {formatMerchantPayoutStatusLabel(order.merchantPayoutStatus)}
              </span>
            </div>
            {buyerConfirmedLabel ? (
              <p className="font-mono text-[10px] text-text-disabled">
                買家確認收貨：{buyerConfirmedLabel}
              </p>
            ) : null}
            {order.merchantPayoutStatus === "held" &&
            merchantPayoutHoldUntilLabel ? (
              <p className="font-mono text-[10px] text-text-disabled">
                款項保留於平台，預計於 {merchantPayoutHoldUntilLabel} 撥至商戶
              </p>
            ) : null}
          </div>
        ) : null}

      </section>

      {(needsSellerFps ||
        (isSeller &&
          order.useAuthentication &&
          order.sellerSettlementStatus === "pending")) && (
        <div className="space-y-3" aria-label="待辦提醒">
          {needsSellerFps ? (
            <div className={ORDER_ALERT_CLASS}>
              <p className="text-[12px] text-text-secondary leading-relaxed">
                請補充轉數快收款人姓名及 ID／電話／電郵，以便平台於買家確認收貨後撥款。
              </p>
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => setFpsDialogOpen(true)}
                  className="text-[12px] font-semibold text-brand underline-offset-2 hover:underline"
                >
                  立即填寫
                </button>
                <Link
                  href="/profile/user/settings"
                  className="text-[12px] font-semibold text-brand underline-offset-2 hover:underline"
                >
                  前往個人設定
                </Link>
              </div>
            </div>
          ) : null}

          {isSeller &&
          order.useAuthentication &&
          order.sellerSettlementStatus === "pending" ? (
            <div className={ORDER_ALERT_CLASS}>
              <p className="text-[12px] font-semibold text-warning">
                鑑定失敗追償待處理
              </p>
              <p className="text-[12px] text-text-secondary leading-relaxed">
                平台判定為賣方責任。請依平台通知向平台繳付追償款項
                {order.sellerReceivableAmountHkd != null
                  ? `（HK$ ${order.sellerReceivableAmountHkd.toLocaleString("zh-HK", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}）`
                  : ""}
                ，完成後平台將安排寄回卡牌。
              </p>
            </div>
          ) : null}
        </div>
      )}

      <section
        className={`${ORDER_DETAIL_CARD_CLASS} space-y-4`}
        aria-label="交易進度"
      >
        <h2 className={SECTION_TITLE_CLASS}>
          交易進度
        </h2>

        {showMerchantPendingPaymentBanner ? (
          <div className="space-y-3 rounded-lg border border-brand/20 bg-brand/5 p-3">
            <p className="text-[12px] text-text-secondary leading-relaxed">
              {isMerchantPaymentExpired
                ? "此訂單付款期限已過，掛單已釋放。請返回市集重新下單。"
                : isBuyer
                  ? "此訂單尚未完成託管付款，請於 48 小時內完成 Stripe 全額支付，資金將由平台鎖定託管。"
                  : "等待買家完成託管付款，收款後方可安排出貨。"}
            </p>
            {order.paymentExpiresAt && !isMerchantPaymentExpired ? (
              <p
                className={
                  isExpiringSoon
                    ? "font-mono text-[11px] text-warning"
                    : "font-mono text-[11px] text-text-disabled"
                }
              >
                {countdownLabel}
              </p>
            ) : null}
            {isBuyer && !isMerchantPaymentExpired ? (
              <button
                type="button"
                disabled={isActionLoading}
                onClick={() => router.push("/checkout/" + order.id)}
                className="w-full h-10 rounded-xl bg-brand text-[#1A1612] font-sans font-semibold text-[13px] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                前往付款
              </button>
            ) : null}
            {isBuyer && isMerchantPaymentExpired ? (
              <Link
                href="/marketplace"
                className="inline-flex h-10 w-full items-center justify-center rounded-xl border border-brand/25 bg-brand/10 font-sans text-[13px] font-semibold text-brand"
              >
                返回市集重新下單
              </Link>
            ) : null}
          </div>
        ) : null}

        {useMerchantB2cEscrowUi ? (
          <div className="space-y-4">
            {order.useAuthentication ? (
              <MerchantAuthSellerTimeline
                embedded
                escrowStatus={order.merchantEscrowStatus ?? null}
                payoutStatus={order.merchantPayoutStatus}
              />
            ) : (
              <MerchantB2cDirectTimeline
                embedded
                escrowStatus={order.merchantEscrowStatus ?? null}
                perspective="buyer"
                shippingMethod={order.shippingMethod}
                payoutStatus={order.merchantPayoutStatus}
              />
            )}

            {isPendingEscrowPayment ? null : isBuyer &&
            order.merchantEscrowStatus === "payment_held" ? (
            order.shippingMethod === "meetup" ? (
              canCompletePurchase ? (
                <div className="space-y-3">
                  <p className="text-[12.5px] text-text-secondary leading-relaxed">
                    請與商戶約定面交／自取時間地點，現場點清後確認完成。
                  </p>
                  <MemberOrderCompleteConfirmDialog
                    disabled={isActionLoading}
                    isActionLoading={isActionLoading}
                    onConfirm={handleComplete}
                    triggerClassName="w-full h-10 bg-success text-white font-sans font-semibold text-[13px] rounded-xl hover:bg-success-hover active:scale-[0.98] transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  />
                </div>
              ) : null
            ) : (
              <p className="text-[12.5px] text-text-secondary leading-relaxed">
                款項已由平台託管，等待商戶安排發貨。
              </p>
            )
          ) : null}

          {(order.sfLockerCode ||
            order.buyerPhone ||
            order.meetupDetail ||
            order.buyerRemark ||
            order.sfAddress) ? (
            <div className="space-y-2 border-t border-white/[0.06] pt-4">
              <h3 className={SECTION_TITLE_CLASS}>
                交收資料
              </h3>
              <div className="space-y-1.5 font-mono text-[12px] text-text-secondary">
                {order.shippingMethod === "meetup" ? (
                  <>
                    {order.buyerPhone ? (
                      <p>
                        <span className="text-text-disabled">聯絡電話：</span>
                        {order.buyerPhone}
                      </p>
                    ) : null}
                    {order.meetupDetail ? (
                      <p>
                        <span className="text-text-disabled">面交備註：</span>
                        {order.meetupDetail}
                      </p>
                    ) : null}
                  </>
                ) : (
                  <>
                    {order.buyerPhone ? (
                      <p>
                        <span className="text-text-disabled">聯絡電話：</span>
                        {order.buyerPhone}
                      </p>
                    ) : null}
                    {order.sfLockerCode ? (
                      <p>
                        <span className="text-text-disabled">自提點代碼：</span>
                        {order.sfLockerCode}
                      </p>
                    ) : null}
                    {order.sfAddress ? (
                      <p>
                        <span className="text-text-disabled">收件地址／自提點：</span>
                        {order.sfAddress}
                      </p>
                    ) : null}
                  </>
                )}
                {order.buyerRemark ? (
                  <p>
                    <span className="text-text-disabled">備註：</span>
                    {order.buyerRemark}
                  </p>
                ) : null}
              </div>
            </div>
          ) : null}

          {isBuyer &&
          order.merchantEscrowStatus === "shipped" &&
          order.outboundTrackingNo ? (
            <p className="font-mono text-[12px] text-brand">
              物流：
              {order.outboundCourierName
                ? `${order.outboundCourierName} · `
                : ""}
              {order.outboundTrackingNo}
            </p>
          ) : null}

          {isBuyer &&
          canCompletePurchase &&
          (order.merchantEscrowStatus === "shipped" ||
            order.merchantEscrowStatus === "authenticated") && (
            <div className="space-y-3">
              <p className="text-[12.5px] text-text-secondary leading-relaxed">
                商戶已發貨。收到卡牌並驗貨後，請確認完成交易；款項將保留於平台 7 日後撥至商戶。
              </p>
              <MemberOrderCompleteConfirmDialog
                disabled={isActionLoading}
                isActionLoading={isActionLoading}
                onConfirm={handleComplete}
                triggerClassName="w-full h-10 bg-success text-white font-sans font-semibold text-[13px] rounded-xl hover:bg-success-hover active:scale-[0.98] transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              />
            </div>
          )}
        </div>
      ) : useMeetupUi ? (
        <div className="space-y-4">
          <MemberP2pOrderTimeline embedded status={order.status} />

          {isPending && !isPendingEscrowPayment && (
            <div className="space-y-3">
              <p className="text-[12.5px] text-text-secondary leading-relaxed">
                請與{isBuyer ? "賣家" : "買家"}
                約定面交時間地點，現場點清錢貨後，
                {isBuyer ? "點擊確認完成。" : "待買家確認完成交易。"}
              </p>
              <div className="flex flex-col gap-2">
                {isBuyer && (
                  <MemberOrderCompleteConfirmDialog
                    disabled={isActionLoading}
                    isActionLoading={isActionLoading}
                    onConfirm={handleComplete}
                    triggerClassName="w-full h-10 bg-success text-white font-sans font-semibold text-[13px] rounded-xl hover:bg-success-hover active:scale-[0.98] transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  />
                )}
                {order.canCancel && (
                  <AlertDialog>
                    <AlertDialogTrigger
                      disabled={isActionLoading}
                      className="w-full h-10 font-sans font-semibold text-[13px] rounded-xl bg-[rgba(239,68,68,0.10)] text-warning border border-warning/20 hover:bg-[rgba(239,68,68,0.18)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isActionLoading ? "處理中…" : "取消交易"}
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
                        <span className="font-bold text-brand">
                          {counterpartName}
                        </span>{" "}
                        的待處理訂單（
                        <span className="font-mono text-warning">
                          {"HK$ " + order.finalPrice.toLocaleString("zh-TW")}
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
              </div>
            </div>
          )}

          {showReviewCta && (
            <button
              type="button"
              data-testid="order-review-cta"
              disabled={isActionLoading}
              onClick={handleOpenReview}
              className="inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-xl bg-brand font-sans text-[13px] font-semibold text-[#17130f] transition-colors hover:bg-brand-hover active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <MessageSquareText className="size-3.5 shrink-0" aria-hidden="true" />
              給予對手評價
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <MemberAuthOrderTimeline
            embedded
            status={order.status}
            escrowStatus={order.escrowStatus}
            paymentConfirmedAt={order.paymentConfirmedAt}
            perspective={order.persona}
            sellerPayoutStatus={order.sellerPayoutStatus}
            fpsPayoutRequestStatus={order.fpsPayoutRequestStatus}
          />

          {order.escrowStatus === "payment" && order.canPay && isBuyer ? (
            <div className="space-y-3 border-t border-white/[0.06] pt-4">
              <p className="text-[12.5px] text-text-secondary leading-relaxed">
                此訂單尚未完成託管付款，請前往結帳頁完成卡價與鑑定服務費支付。
              </p>
              <button
                type="button"
                disabled={isActionLoading}
                onClick={() => router.push("/checkout/" + order.id)}
                className="w-full h-10 rounded-xl bg-brand text-[#1A1612] font-sans font-semibold text-[13px] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                前往付款
              </button>
            </div>
          ) : null}

          {order.escrowStatus === "custody" && isSeller ? (
            <div className="space-y-3 border-t border-white/[0.06] pt-4">
              <p className="text-[12.5px] text-text-secondary leading-relaxed">
                請將卡牌寄往平台倉庫，並填寫快遞公司與物流單號。
              </p>
              {order.inboundTrackingNo ? (
                <p className="font-mono text-[12px] text-brand">
                  已提交：
                  {order.inboundCourierName
                    ? `${order.inboundCourierName} · `
                    : ""}
                  {order.inboundTrackingNo}
                </p>
              ) : (
                <>
                  <input
                    type="text"
                    value={inboundCourierInput}
                    onChange={(event) =>
                      setInboundCourierInput(event.target.value)
                    }
                    placeholder="快遞公司（例如：順豐、DHL）"
                    className="w-full h-10 rounded-lg border border-white/10 bg-[#120f0c] px-3 text-[12px] text-brand"
                  />
                  <input
                    type="text"
                    value={inboundTrackingInput}
                    onChange={(event) =>
                      setInboundTrackingInput(event.target.value)
                    }
                    placeholder="物流單號"
                    className="w-full h-10 rounded-lg border border-white/10 bg-[#120f0c] px-3 text-[12px] text-brand"
                  />
                  <button
                    type="button"
                    disabled={
                      isActionLoading ||
                      !inboundTrackingInput.trim() ||
                      !inboundCourierInput.trim()
                    }
                    onClick={() => void handleSubmitInbound()}
                    className="w-full h-10 rounded-xl bg-brand text-[#1A1612] font-semibold text-[13px] disabled:opacity-50"
                  >
                    提交入庫物流單號
                  </button>
                </>
              )}
            </div>
          ) : null}

          {order.escrowStatus === "custody" && isBuyer ? (
            <p className="border-t border-white/[0.06] pt-4 text-[12px] text-text-secondary">
              等待賣家將卡牌寄至平台倉庫…
            </p>
          ) : null}

          {order.escrowStatus === "shipped" ? (
            <div className="space-y-2 border-t border-white/[0.06] pt-4">
              {order.outboundTrackingNo ? (
                <p className="font-mono text-[12px] text-brand">
                  平台代發物流：
                  {order.outboundCourierName
                    ? `${order.outboundCourierName} · `
                    : ""}
                  {order.outboundTrackingNo}
                </p>
              ) : (
                <p className="text-[12px] text-text-secondary">
                  平台鑑定通過，待上載寄出物流單號。
                </p>
              )}
              {(isMerchantBuyerOrder
                ? order.canCompleteMerchantPurchase
                : order.canConfirmReceipt) ? (
                isMerchantBuyerOrder ? (
                  <MemberOrderCompleteConfirmDialog
                    disabled={isActionLoading}
                    isActionLoading={isActionLoading}
                    onConfirm={handleComplete}
                    triggerLabel="確認收貨"
                    triggerClassName="w-full h-10 rounded-xl bg-success text-white font-semibold text-[13px] disabled:opacity-50 disabled:cursor-not-allowed"
                  />
                ) : (
                  <MemberOrderCompleteConfirmDialog
                    disabled={isActionLoading}
                    isActionLoading={isActionLoading}
                    onConfirm={handleConfirmReceipt}
                    triggerLabel="確認收貨"
                    triggerClassName="w-full h-10 rounded-xl bg-success text-white font-semibold text-[13px] disabled:opacity-50 disabled:cursor-not-allowed"
                  />
                )
              ) : null}
            </div>
          ) : null}

          {order.status === "cancelled" && order.useAuthentication ? (
            <p className="border-t border-white/[0.06] pt-4 text-[12px] text-text-secondary">
              鑑定失敗或交易已取消，模擬全額退款已標記（測試模式）。
            </p>
          ) : null}

          {isPending && order.canCancel && isSeller ? (
            <AlertDialog>
              <AlertDialogTrigger
                disabled={isActionLoading}
                className="w-full h-10 rounded-xl border border-red-400/30 text-red-300 text-[13px] font-semibold disabled:opacity-50"
              >
                取消交易
              </AlertDialogTrigger>
              <AlertDialogContent className="bg-[#26211C] border border-white/10">
                <AlertDialogHeader>
                  <AlertDialogTitle className="text-[15px] font-black">
                    確認取消交易
                  </AlertDialogTitle>
                </AlertDialogHeader>
                <p className="text-[12.5px] text-text-secondary">
                  確認後訂單將取消，商品將重新上架。
                </p>
                <div className="flex flex-col gap-2">
                  <AlertDialogAction
                    onClick={() => void handleCancel()}
                    className="h-11 rounded-xl bg-[#ef4444] font-black text-white"
                  >
                    確認取消
                  </AlertDialogAction>
                  <AlertDialogCancel className="h-10 rounded-xl border border-white/10">
                    返回
                  </AlertDialogCancel>
                </div>
              </AlertDialogContent>
            </AlertDialog>
          ) : null}

          {showReviewCta && (
            <button
              type="button"
              data-testid="order-review-cta"
              disabled={isActionLoading}
              onClick={handleOpenReview}
              className="inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-xl bg-brand font-sans text-[13px] font-semibold text-[#17130f] transition-colors hover:bg-brand-hover active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <MessageSquareText className="size-3.5 shrink-0" aria-hidden="true" />
              給予對手評價
            </button>
          )}
        </div>
      )}
      </section>

      <section className="space-y-3" aria-label="帳單明細">
        {useMerchantB2cEscrowUi && order.useAuthentication ? (
          <MemberAuthOrderInvoice
            finalPrice={order.finalPrice}
            isSeller={isSeller}
            buyerTotalAmount={order.buyerTotalAmount ?? order.totalAmount}
            platformSubsidyAmount={order.platformSubsidyAmount}
            authFee={order.authFeeAuth ?? order.authFee}
            itemSubtotal={order.itemSubtotalAuth ?? order.itemSubtotal}
            inboundShippingFee={order.inboundShippingFeeAuth}
            outboundShippingFee={order.outboundShippingFeeAuth}
          />
        ) : useMerchantB2cEscrowUi ? (
          <MemberMerchantB2cOrderInvoice
            itemSubtotal={order.itemSubtotal ?? order.finalPrice}
            shippingFee={order.shippingFee ?? 0}
            shippingMethod={order.shippingMethod ?? null}
            totalAmount={order.totalAmount ?? order.finalPrice}
            authFee={order.authFee ?? 0}
            isSeller={isSeller}
          />
        ) : useMeetupUi ? (
          <MemberP2pOrderInvoice
            finalPrice={order.finalPrice}
            isSeller={isSeller}
          />
        ) : (
          <MemberAuthOrderInvoice
            finalPrice={order.finalPrice}
            isSeller={isSeller}
            orderId={order.id}
            orderNumber={order.orderNumber}
            escrowStatus={order.escrowStatus}
            status={order.status}
            buyerTotalAmount={order.buyerTotalAmount}
            platformSubsidyAmount={order.platformSubsidyAmount}
            authFee={order.authFeeAuth}
            itemSubtotal={order.itemSubtotalAuth}
            inboundShippingFee={order.inboundShippingFeeAuth}
            outboundShippingFee={order.outboundShippingFeeAuth}
          />
        )}
      </section>

      {galleryImages.length > 0 ? (
        <section aria-label="實物照">
          <OrderListingPhotoGrid
            images={galleryImages}
            altPrefix={order.product.cardName + " 實物照"}
            onImageClick={(photoIdx) => {
              setViewerIndex(photoIdx);
              setIsViewerOpen(true);
            }}
          />
        </section>
      ) : null}

      <ImageViewer
        isOpen={isViewerOpen}
        onClose={() => setIsViewerOpen(false)}
        images={galleryImages}
        initialIndex={viewerIndex}
      />
    </div>
  );
}
