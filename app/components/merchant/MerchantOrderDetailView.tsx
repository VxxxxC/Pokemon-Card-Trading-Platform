"use client";

import { MEMBER_AUTH_SHIPPING_FEE } from "@/app/lib/member-order/p2p";
import { formatPaymentDeadline } from "@/lib/merchant-checkout/pending-payment-expiry";
import { DEFAULT_COMMISSION_RATE } from "@/lib/platform/financial-config";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import { Info, MessageSquareText } from "lucide-react";
import { useRouter } from "next/navigation";
import {
  cancelMerchantAuthOrder,
  submitMerchantDirectFulfillment,
  submitMerchantLogistics,
  type MerchantOrderDetail,
} from "@/app/actions/orders";
import { ProfileAvatar } from "@/app/components/profile/ProfileAvatar";
import { MemberMerchantB2cOrderInvoice } from "@/app/components/user/MemberMerchantB2cOrderInvoice";
import { MemberAuthOrderInvoice } from "@/app/components/user/MemberAuthOrderInvoice";
import { mapMerchantOrderDetailToSaleOrder } from "@/app/lib/merchant-order/map-sale-order";
import {
  formatMerchantPayoutHoldUntilLabel,
  formatMerchantPayoutStatusLabel,
  MERCHANT_CONNECT_T7_PAYOUT_POLICY_TEXT,
  resolveMerchantTransferDisplayLabel,
} from "@/lib/merchant-order/merchant-payout-hold";
import { MerchantAuthSellerTimeline } from "@/app/components/merchant/MerchantAuthSellerTimeline";
import { MerchantB2cDirectTimeline } from "@/app/components/merchant/MerchantB2cDirectTimeline";
import { SellerReputationMeta } from "@/lib/marketplace/seller-reputation-meta";
import { toast } from "sonner";
import { SECTION_TITLE_CLASS } from "@/lib/ui/section-title-ui";
import { ImageViewer } from "@/app/components/shared/ImageViewer";
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
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const REMARKS_PRESETS = [
  "正面全貌：印刷居中度完美，閃膜無微劃傷",
  "背面全貌：微距顯示四角完好，無任何白邊",
  "正面右上角：金邊切割銳利，無邊緣磨損",
  "背面左下角：四維防偽雷射標籤對位極致",
  "鑑定認證封殼：防塵防紫外，全密閉存證封裝",
  "條碼微距特寫：認證編號完美可讀，防偽一致",
];

const ORDER_DETAIL_CARD_CLASS =
  "rounded-lg border border-white/[0.08] bg-bg-card/20 p-4";

const ORDER_ALERT_CLASS =
  "rounded-lg border border-warning/30 bg-warning/10 p-3 space-y-2";

type MerchantOrderDetailViewProps = {
  order: MerchantOrderDetail;
  onRefresh: () => void;
  onOpenReview?: (orderId: string, revieweeId: string) => void;
  defaultCommissionRate?: number;
};

async function runSubmitInboundTracking(
  orderId: string,
  trackingNo: string,
  courierName: string,
  onSuccess?: () => void,
): Promise<void> {
  const result = await submitMerchantLogistics(orderId, trackingNo, courierName);
  if (!result.success) {
    toast.error(result.error);
    return;
  }
  toast.success("物流單號已提交");
  onSuccess?.();
}

async function runSubmitDirectFulfillment(
  orderId: string,
  trackingNo: string | undefined,
  courierName: string | undefined,
  onSuccess?: () => void,
): Promise<void> {
  const result = await submitMerchantDirectFulfillment(
    orderId,
    trackingNo,
    courierName,
  );
  if (!result.success) {
    toast.error(result.error);
    return;
  }
  toast.success(trackingNo ? "物流單號已提交" : "已確認面交完成");
  onSuccess?.();
}

async function runCancelMerchantAuthOrder(
  orderId: string,
  onSuccess?: () => void,
): Promise<void> {
  const result = await cancelMerchantAuthOrder(orderId);
  if (!result.success) {
    toast.error(result.error);
    return;
  }
  toast.success("訂單已取消");
  onSuccess?.();
}

export function MerchantOrderDetailView({
  order: merchantOrder,
  onOpenReview,
  onRefresh,
  defaultCommissionRate = DEFAULT_COMMISSION_RATE,
}: MerchantOrderDetailViewProps) {
  const router = useRouter();
  const order = mapMerchantOrderDetailToSaleOrder(merchantOrder);
  const buyerProfileHref = `/profile/${merchantOrder.buyer.id}?persona=member`;

  const refreshAfterLogistics = () => {
    if (onRefresh) {
      onRefresh();
      return;
    }
    router.refresh();
  };

  const [isViewerOpen, setIsViewerOpen] = useState(false);
  const [viewerIndex, setViewerIndex] = useState(0);
  const [inboundTrackingInput, setInboundTrackingInput] = useState("");
  const [inboundCourierInput, setInboundCourierInput] = useState("");
  const [outboundTrackingInput, setOutboundTrackingInput] = useState("");
  const [outboundCourierInput, setOutboundCourierInput] = useState("");
  const [isActionLoading, setIsActionLoading] = useState(false);
  const isAuthOrder = Boolean(merchantOrder.requiresAuthentication);

  const merchantImages = useMemo(() => {
    if (merchantOrder.listingImageUrls.length > 0) {
      return merchantOrder.listingImageUrls;
    }
    if (merchantOrder.product.imageUrl) {
      return [merchantOrder.product.imageUrl];
    }
    return [`https://picsum.photos/seed/${merchantOrder.id}/400/500`];
  }, [merchantOrder]);

  const stripeDisplay = useMemo(() => {
    const commissionRate =
      merchantOrder.commissionRateApplied ?? defaultCommissionRate;
    const estimatedCommission = Math.round(
      merchantOrder.itemSubtotal * commissionRate * 100,
    ) / 100;
    const platformFee =
      merchantOrder.commissionAmount ?? estimatedCommission;
    const platformFeeIsEstimate = merchantOrder.commissionAmount == null;
    const directShippingFee = merchantOrder.requiresAuthentication
      ? 0
      : merchantOrder.shippingFee;
    const authInboundShippingFee = merchantOrder.requiresAuthentication
      ? merchantOrder.inboundShippingFee > 0
        ? merchantOrder.inboundShippingFee
        : MEMBER_AUTH_SHIPPING_FEE
      : 0;
    const sellerShippingReimbursement = merchantOrder.requiresAuthentication
      ? authInboundShippingFee
      : directShippingFee;
    const payoutAmount =
      merchantOrder.merchantPayoutAmount ??
      Math.max(
        0,
        merchantOrder.itemSubtotal +
          sellerShippingReimbursement -
          platformFee,
      );
    const payoutGross =
      merchantOrder.merchantPayoutGross ?? payoutAmount;
    const recoveryDeductionTotal =
      merchantOrder.recoveryDeductionTotal ?? 0;

    return {
      paymentIntentId: merchantOrder.stripePaymentIntentId,
      transferId: merchantOrder.stripeTransferId,
      platformFee,
      platformFeeIsEstimate,
      payoutGross,
      recoveryDeductionTotal,
      payoutAmount,
      payoutStatus: merchantOrder.payoutStatus,
      authFee: merchantOrder.authFee,
      authInboundShippingFee,
      directShippingFee,
    };
  }, [merchantOrder, defaultCommissionRate]);

  const transferDisplay = useMemo(
    () =>
      resolveMerchantTransferDisplayLabel({
        stripeTransferId: merchantOrder.stripeTransferId,
        payoutStatus: merchantOrder.payoutStatus,
        escrowStatus: merchantOrder.escrowStatus,
      }),
    [merchantOrder],
  );

  const displayOrderNumber = order.orderNumber ?? order.id;

  return (
    <div className="mx-auto w-full max-w-2xl space-y-4 pb-6 animate-fadeIn">
      <section
        className={`${ORDER_DETAIL_CARD_CLASS} space-y-4`}
        aria-label="訂單摘要"
      >
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="inline-flex items-center rounded-md border border-warning/30 bg-warning/10 px-2 py-0.5 font-sans text-[11px] font-medium text-warning">
            賣出交易
          </span>
          {isAuthOrder ? (
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
                catalogImageUrl={merchantOrder.product.catalogImageUrl}
                alt={order.cardName}
              />
              <div className="min-w-0 flex-1">
                <p className="truncate font-sans text-[15px] font-semibold text-text-primary">
                  {order.cardName}
                </p>
                <p className="mt-0.5 font-mono text-[11px] text-text-secondary">
                  {order.cardNo} · 等級: {order.grade}
                </p>
              </div>
            </div>

            <Link
              href={buyerProfileHref}
              data-testid="merchant-order-buyer-profile-link"
              className="flex items-center gap-2 border-t border-white/[0.06] px-3 py-2 transition-colors hover:bg-bg-page/40"
              title={`買家：${order.buyerName}`}
            >
              <ProfileAvatar
                avatarUrl={merchantOrder.buyer.avatarUrl}
                displayName={order.buyerName}
                className="h-7 w-7 shrink-0 border border-white/10"
                fallbackClassName="bg-bg-page text-brand text-[10px] font-bold"
              />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  <span className="font-sans text-[10px] text-text-disabled shrink-0">
                    買家
                  </span>
                  <span className={`truncate ${SECTION_TITLE_CLASS}`}>
                    {order.buyerName}
                  </span>
                  <SellerReputationMeta
                    rating={merchantOrder.buyer.ratingScore ?? 0}
                    reviewCount={merchantOrder.buyer.publicReviewCount}
                    totalTrades={merchantOrder.buyer.completedTradesCount}
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
              title={merchantOrder.listingId}
            >
              {merchantOrder.listingId}
            </dd>
            {order.createdAt ? (
              <p className="mt-1 font-mono text-[10px] text-text-disabled">
                建立 {order.createdAt}
              </p>
            ) : null}
          </div>
        </dl>
      </section>

      <section
        className={`${ORDER_DETAIL_CARD_CLASS} space-y-4`}
        aria-label="交易進度"
      >
        <h2 className={SECTION_TITLE_CLASS}>
          交易進度
        </h2>

        <div className="space-y-4">
          {isAuthOrder ? (
            <MerchantAuthSellerTimeline
              embedded
              escrowStatus={merchantOrder.escrowStatus}
              payoutStatus={merchantOrder.payoutStatus}
            />
          ) : (
            <MerchantB2cDirectTimeline
              embedded
              escrowStatus={merchantOrder.escrowStatus}
              perspective="seller"
              shippingMethod={merchantOrder.shippingMethod}
              payoutStatus={merchantOrder.payoutStatus}
            />
          )}

          {(merchantOrder.sfLockerCode ||
            merchantOrder.buyerPhone ||
            merchantOrder.meetupDetail ||
            merchantOrder.buyerRemark ||
            merchantOrder.sfAddress) ? (
            <div className="space-y-2 border-t border-white/[0.06] pt-4">
              <h3 className={SECTION_TITLE_CLASS}>
                買家交收資料
              </h3>
              <div className="space-y-1.5 font-mono text-[12px] text-text-secondary">
                {merchantOrder.shippingMethod === "meetup" ? (
                  <>
                    {merchantOrder.buyerPhone ? (
                      <p>
                        <span className="text-text-disabled">聯絡電話：</span>
                        {merchantOrder.buyerPhone}
                      </p>
                    ) : null}
                    {merchantOrder.meetupDetail ? (
                      <p>
                        <span className="text-text-disabled">面交備註：</span>
                        {merchantOrder.meetupDetail}
                      </p>
                    ) : null}
                  </>
                ) : (
                  <>
                    {merchantOrder.buyerPhone ? (
                      <p>
                        <span className="text-text-disabled">聯絡電話：</span>
                        {merchantOrder.buyerPhone}
                      </p>
                    ) : null}
                    {merchantOrder.sfLockerCode ? (
                      <p>
                        <span className="text-text-disabled">自提點代碼：</span>
                        {merchantOrder.sfLockerCode}
                      </p>
                    ) : null}
                    {merchantOrder.sfAddress ? (
                      <p>
                        <span className="text-text-disabled">收件地址／自提點：</span>
                        {merchantOrder.sfAddress}
                      </p>
                    ) : null}
                  </>
                )}
                {merchantOrder.buyerRemark ? (
                  <p>
                    <span className="text-text-disabled">買家備註：</span>
                    {merchantOrder.buyerRemark}
                  </p>
                ) : null}
              </div>
            </div>
          ) : null}

          {order.status === "cancelled" && (
            <div className={ORDER_ALERT_CLASS}>
              <p className="text-[12px] font-semibold text-warning">
                訂單已退款 / 已取消
              </p>
            </div>
          )}

          {merchantOrder.escrowStatus === "pending_payment" && (
            <div className="space-y-3 rounded-lg border border-brand/20 bg-brand/5 p-3">
              <p className="text-[12px] text-text-secondary leading-relaxed">
                訂單已成立，正在等待買家完成託管付款{" "}
                <span className="text-brand font-mono font-bold">
                  HK$ {order.amount.toLocaleString("zh-TW")}
                </span>
                。 收款確認後方可安排出貨。
              </p>
              {merchantOrder.paymentExpiresAt ? (
                <p className="font-mono text-[11px] leading-relaxed text-text-disabled">
                  買家須於 {formatPaymentDeadline(merchantOrder.paymentExpiresAt)}{" "}
                  前完成付款；若時限前未完成付款，訂單將自動取消，掛單會重新上架至大盤市場。
                </p>
              ) : null}
            </div>
          )}

          {merchantOrder.canCancelAuthOrder ? (
            <AlertDialog>
              <AlertDialogTrigger
                disabled={isActionLoading}
                className="w-full h-10 font-sans font-semibold text-[13px] rounded-xl bg-[rgba(239,68,68,0.10)] text-warning border border-warning/20 hover:bg-[rgba(239,68,68,0.18)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isActionLoading ? "處理中…" : "取消訂單"}
              </AlertDialogTrigger>
              <AlertDialogContent className="max-w-sm rounded-2xl border border-[#ef4444]/30 bg-[#26211C] p-6 text-[#eae1da]">
                <AlertDialogHeader className="text-left">
                  <AlertDialogTitle className="text-[15px] font-black">
                    確認取消訂單
                  </AlertDialogTitle>
                  <AlertDialogDescription className="text-[11px] font-mono uppercase tracking-wider text-[#8A8680]">
                    Cancel Order
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <p className="py-3 text-[12.5px] leading-relaxed text-[#d4c4b7]">
                  您即將取消與{" "}
                  <span className="font-bold text-brand">{order.buyerName}</span>{" "}
                  的鑑定訂單（
                  <span className="font-mono text-warning">
                    HK$ {order.amount.toLocaleString("zh-TW")}
                  </span>
                  ）。確認後訂單將取消並退款給買家。
                </p>
                <div className="flex flex-col gap-2">
                  <AlertDialogAction
                    disabled={isActionLoading}
                    onClick={(event) => {
                      event.preventDefault();
                      setIsActionLoading(true);
                      void runCancelMerchantAuthOrder(
                        order.id,
                        refreshAfterLogistics,
                      ).finally(() => setIsActionLoading(false));
                    }}
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
          ) : null}

          {merchantOrder.canSubmitLogistics &&
            !merchantOrder.inboundTrackingNo && (
            <div className="space-y-3">
              <p className="text-[12.5px] text-text-secondary leading-relaxed">
                買家已完成付款，資金已託管。請將卡牌寄往平台倉庫，並填寫快遞公司與物流單號以供入庫鑑定。
              </p>
              <input
                type="text"
                value={inboundCourierInput}
                onChange={(event) => setInboundCourierInput(event.target.value)}
                placeholder="快遞公司（例如：順豐、DHL）"
                className="w-full h-10 rounded-lg border border-white/10 bg-[#120f0c] px-3 text-[12px] text-brand"
              />
              <input
                type="text"
                value={inboundTrackingInput}
                onChange={(event) => setInboundTrackingInput(event.target.value)}
                placeholder="物流單號"
                className="w-full h-10 rounded-lg border border-white/10 bg-[#120f0c] px-3 text-[12px] text-brand"
              />
              <button
                type="button"
                disabled={
                  !inboundTrackingInput.trim() || !inboundCourierInput.trim()
                }
                onClick={() => {
                  void runSubmitInboundTracking(
                    order.id,
                    inboundTrackingInput.trim(),
                    inboundCourierInput.trim(),
                    refreshAfterLogistics,
                  );
                }}
                className="w-full h-10 rounded-xl bg-brand text-[#17130f] font-sans font-semibold text-[13px] disabled:opacity-50"
              >
                提交入庫物流單號
              </button>
            </div>
          )}

          {merchantOrder.requiresAuthentication &&
            merchantOrder.escrowStatus === "payment_held" &&
            merchantOrder.inboundTrackingNo && (
            <div className="space-y-3">
              <p className="text-[12.5px] text-text-secondary leading-relaxed">
                已提交入庫物流單號，等待平台確認入庫後開始鑑定。
              </p>
              <p className="font-mono text-[12px] text-brand">
                已提交：
                {merchantOrder.inboundCourierName
                  ? `${merchantOrder.inboundCourierName} · `
                  : ""}
                {merchantOrder.inboundTrackingNo}
              </p>
            </div>
          )}

          {merchantOrder.canSubmitDirectFulfillment && (
            <div className="space-y-3">
              <p className="text-[12.5px] text-text-secondary leading-relaxed">
                買家已完成託管付款，請安排快遞發貨並填寫快遞公司與物流單號。
              </p>
              <input
                type="text"
                value={outboundCourierInput}
                onChange={(event) =>
                  setOutboundCourierInput(event.target.value)
                }
                placeholder="快遞公司（例如：順豐、DHL）"
                className="w-full h-10 rounded-lg border border-white/10 bg-[#120f0c] px-3 text-[12px] text-brand"
              />
              <input
                type="text"
                value={outboundTrackingInput}
                onChange={(event) =>
                  setOutboundTrackingInput(event.target.value)
                }
                placeholder="物流單號"
                className="w-full h-10 rounded-lg border border-white/10 bg-[#120f0c] px-3 text-[12px] text-brand"
              />
              <button
                type="button"
                disabled={
                  !outboundTrackingInput.trim() ||
                  !outboundCourierInput.trim()
                }
                onClick={() => {
                  void runSubmitDirectFulfillment(
                    order.id,
                    outboundTrackingInput.trim(),
                    outboundCourierInput.trim(),
                    refreshAfterLogistics,
                  );
                }}
                className="w-full h-10 rounded-xl bg-brand text-[#17130f] font-sans font-semibold text-[13px] disabled:opacity-50"
              >
                提交物流單號
              </button>
            </div>
          )}

          {merchantOrder.escrowStatus === "payment_held" &&
            !merchantOrder.requiresAuthentication &&
            merchantOrder.shippingMethod === "meetup" && (
            <p className="text-[12.5px] text-text-secondary leading-relaxed">
              款項已託管，待買家面交／自取後確認收貨。
            </p>
          )}

          {merchantOrder.escrowStatus === "shipped" &&
            !merchantOrder.requiresAuthentication && (
            <div className="space-y-3">
              <p className="text-[12.5px] text-text-secondary leading-relaxed">
                {merchantOrder.outboundTrackingNo
                  ? "已提交物流單號，等待買家確認收貨後將自動撥款。"
                  : "已確認面交完成，等待買家確認收貨後將自動撥款。"}
              </p>
              {merchantOrder.outboundTrackingNo ? (
                <p className="font-mono text-[12px] text-brand">
                  物流：
                  {merchantOrder.outboundCourierName
                    ? `${merchantOrder.outboundCourierName} · `
                    : ""}
                  {merchantOrder.outboundTrackingNo}
                </p>
              ) : null}
            </div>
          )}

          {merchantOrder.escrowStatus === "authenticating" &&
            merchantOrder.requiresAuthentication && (
            <div className="space-y-3">
              <p className="text-[12.5px] text-text-secondary leading-relaxed">
                平台已確認入庫，卡牌正在鑑定中。此階段無需商戶操作。
              </p>
              {merchantOrder.inboundTrackingNo ? (
                <p className="font-mono text-[12px] text-brand">
                  入庫：
                  {merchantOrder.inboundCourierName
                    ? `${merchantOrder.inboundCourierName} · `
                    : ""}
                  {merchantOrder.inboundTrackingNo}
                </p>
              ) : null}
            </div>
          )}

          {merchantOrder.escrowStatus === "authenticated" &&
            merchantOrder.requiresAuthentication && (
            <div className="space-y-3">
              <p className="text-[12.5px] text-text-secondary leading-relaxed">
                {merchantOrder.buyerConfirmedAt
                  ? merchantOrder.payoutHoldUntil
                    ? `買家已確認收貨；款項 T+7 保留中（至 ${formatMerchantPayoutHoldUntilLabel(
                        merchantOrder.payoutHoldUntil,
                      )}）`
                    : "買家已確認收貨；款項 T+7 保留中"
                  : "鑑定已通過，平台將安排寄出給買家。待買家確認收貨後撥款。"}
              </p>
              {merchantOrder.outboundTrackingNo ? (
                <p className="font-mono text-[12px] text-brand">
                  平台代發物流：{merchantOrder.outboundTrackingNo}
                </p>
              ) : (
                <p className="text-[12px] text-text-disabled">
                  待平台上載寄出物流單號。
                </p>
              )}
            </div>
          )}

          {(merchantOrder.escrowStatus === "completed_and_transferred" ||
            merchantOrder.payoutStatus === "paid") && (
            <div className="space-y-3">
              <p className="text-[12.5px] text-text-secondary leading-relaxed">
                交易已完成，款項{" "}
                <span className="font-mono font-bold text-brand">
                  HK$ {stripeDisplay.payoutAmount.toLocaleString("zh-TW")}
                </span>{" "}
                已撥至你的 Stripe Connect 帳戶。
              </p>
              {merchantOrder.canReviewBuyer && onOpenReview ? (
                <button
                  type="button"
                  data-testid="order-review-cta"
                  onClick={() => onOpenReview(order.id, merchantOrder.buyerId)}
                  className="inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-xl bg-brand font-sans text-[13px] font-semibold text-[#17130f] transition-colors hover:bg-brand-hover active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <MessageSquareText
                    className="size-3.5 shrink-0"
                    aria-hidden="true"
                  />
                  給予對手評價
                </button>
              ) : null}
            </div>
          )}
        </div>
      </section>

      <section className="space-y-3" aria-label="帳單明細">
        {isAuthOrder ? (
          <MemberAuthOrderInvoice
            finalPrice={merchantOrder.finalPrice}
            isSeller
            buyerTotalAmount={merchantOrder.buyerTotalAmount}
            authFee={merchantOrder.authFee}
            itemSubtotal={merchantOrder.itemSubtotal}
            inboundShippingFee={merchantOrder.inboundShippingFee}
            outboundShippingFee={merchantOrder.outboundShippingFee}
          />
        ) : (
          <MemberMerchantB2cOrderInvoice
            itemSubtotal={merchantOrder.itemSubtotal}
            shippingFee={merchantOrder.shippingFee}
            shippingMethod={merchantOrder.shippingMethod}
            totalAmount={merchantOrder.totalAmount}
            authFee={0}
            isSeller
          />
        )}

        <div className={`${ORDER_DETAIL_CARD_CLASS} space-y-3`}>
          <h3 className={SECTION_TITLE_CLASS}>
            撥款明細
          </h3>
          <div className="space-y-2 border-t border-white/[0.06] pt-3 font-mono text-[12px] text-text-secondary">
            <div className="flex justify-between gap-3">
              <span>商品成交價</span>
              <span className="text-text-primary">
                HK$ {merchantOrder.itemSubtotal.toLocaleString("zh-TW")}
              </span>
            </div>
            {isAuthOrder && stripeDisplay.authInboundShippingFee > 0 ? (
              <div className="flex justify-between gap-3">
                <span>運費（賣家寄送平台）</span>
                <span className="text-text-primary">
                  HK${" "}
                  {stripeDisplay.authInboundShippingFee.toLocaleString("zh-TW")}
                </span>
              </div>
            ) : null}
            {!isAuthOrder && stripeDisplay.directShippingFee > 0 ? (
              <div className="flex justify-between gap-3">
                <span>
                  運費（
                  {merchantOrder.shippingMethod === "sf"
                    ? "快遞寄貨"
                    : merchantOrder.shippingMethod === "meetup"
                      ? "面交自取"
                      : "—"}
                  ）
                </span>
                <span className="text-text-primary">
                  HK${" "}
                  {stripeDisplay.directShippingFee.toLocaleString("zh-TW")}
                </span>
              </div>
            ) : null}
            <div className="flex justify-between gap-3">
              <span>
                平台費用
                {stripeDisplay.platformFeeIsEstimate ? "（預估）" : ""}
              </span>
              <span className="font-semibold text-warning">
                -HK${" "}
                {stripeDisplay.platformFee.toLocaleString("zh-TW")}
              </span>
            </div>
            {stripeDisplay.recoveryDeductionTotal > 0 ? (
              <div className="flex justify-between gap-3">
                <span>應撥總額</span>
                <span className="text-text-primary">
                  HK$ {stripeDisplay.payoutGross.toLocaleString("zh-TW")}
                </span>
              </div>
            ) : null}
            {stripeDisplay.recoveryDeductionTotal > 0 ? (
              <div className="flex justify-between gap-3">
                <span>追償抵扣</span>
                <span className="font-semibold text-warning">
                  -HK${" "}
                  {stripeDisplay.recoveryDeductionTotal.toLocaleString("zh-TW")}
                </span>
              </div>
            ) : null}
            {merchantOrder.sellerSettlementStatus === "pending" &&
            merchantOrder.gradingFailRecoveryAmount != null ? (
              <div className="flex justify-between gap-3">
                <span>鑑定失敗追償（待繳）</span>
                <span className="font-semibold text-warning">
                  HK${" "}
                  {merchantOrder.gradingFailRecoveryAmount.toLocaleString("zh-TW")}
                </span>
              </div>
            ) : null}
            {merchantOrder.gradingFailRecoveryAmount != null &&
            merchantOrder.sellerSettlementStatus === "cleared" ? (
              <div className="flex justify-between gap-3">
                <span>鑑定失敗追償</span>
                <span className="font-semibold text-text-primary">
                  HK${" "}
                  {merchantOrder.gradingFailRecoveryAmount.toLocaleString("zh-TW")}
                  （已確認）
                </span>
              </div>
            ) : null}
            <div className="flex items-center justify-between gap-2 border-t border-white/[0.06] pt-3 font-sans text-[14px]">
              <span className="font-semibold text-text-primary">
                預計撥款淨額
              </span>
              <span className="flex items-center justify-end gap-1">
                {transferDisplay.showT7PolicyTooltip ? (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger
                        type="button"
                        className="shrink-0 text-brand/70 hover:text-brand focus:outline-none"
                        aria-label="撥款說明"
                      >
                        <Info className="size-3.5" />
                      </TooltipTrigger>
                      <TooltipContent
                        side="top"
                        className="max-w-xs border border-white/10 bg-bg-elevated text-left text-[11px] leading-relaxed text-text-primary"
                      >
                        {MERCHANT_CONNECT_T7_PAYOUT_POLICY_TEXT}
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                ) : null}
                <span className="font-mono text-[18px] font-bold text-brand sm:text-[20px]">
                  HK$ {stripeDisplay.payoutAmount.toLocaleString("zh-TW")}
                </span>
              </span>
            </div>
            <div className="space-y-2 border-t border-white/[0.06] pt-3">
              <div className="flex justify-between gap-3">
                <span>撥款狀態</span>
                <span className="text-text-primary">
                  {formatMerchantPayoutStatusLabel(stripeDisplay.payoutStatus)}
                </span>
              </div>
              {merchantOrder.payoutStatus === "held" &&
              merchantOrder.payoutHoldUntil ? (
                <div className="flex justify-between gap-3">
                  <span>預計撥款時間</span>
                  <span className="text-text-primary">
                    {formatMerchantPayoutHoldUntilLabel(
                      merchantOrder.payoutHoldUntil,
                    )}
                  </span>
                </div>
              ) : null}
              <div className="flex justify-between gap-3 text-[11px]">
                <span>支付編號</span>
                <span className="break-all text-right text-brand">
                  {stripeDisplay.paymentIntentId ?? "—"}
                </span>
              </div>
              <div className="flex justify-between gap-3 text-[11px]">
                <span>撥款轉帳編號</span>
                <span className="break-all text-right text-brand">
                  {transferDisplay.label}
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section aria-label="實物照">
        <OrderListingPhotoGrid
          images={merchantImages}
          altPrefix={`${order.cardName} 實物照`}
          remarks={merchantImages.map((_, idx) => REMARKS_PRESETS[idx] ?? "")}
          onImageClick={(photoIdx) => {
            setViewerIndex(photoIdx);
            setIsViewerOpen(true);
          }}
        />
      </section>

      <ImageViewer
        isOpen={isViewerOpen}
        onClose={() => setIsViewerOpen(false)}
        images={merchantImages}
        initialIndex={viewerIndex}
      />
    </div>
  );
}
