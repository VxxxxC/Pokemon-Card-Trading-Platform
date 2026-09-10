"use client";

import {
  MEMBER_AUTH_SHIPPING_FEE,
} from "@/app/lib/member-order/p2p";
import { AUTH_ESCROW_SF_LEG_FEE_HKD } from "@/lib/auth-escrow/defaults";
import {
  computeFpsGrossPayoutHkd,
  computeFpsNetPayoutAmount,
} from "@/lib/platform/fps-payout-config";
import { MemberOrderInvoiceRow } from "@/app/components/user/member-order-invoice-row";
import { usePlatformAuthFee } from "@/lib/platform/use-platform-auth-fee";
import { SECTION_TITLE_CLASS } from "@/lib/ui/section-title-ui";

type MemberAuthOrderInvoiceProps = {
  finalPrice: number;
  isSeller: boolean;
  orderId?: string;
  orderNumber?: string | null;
  escrowStatus?: string | null;
  status?: string | null;
  releasedAmount?: number;
  platformFee?: number;
  authFee?: number;
  releaseStatus?: "pending" | "completed" | "rejected" | string;
  buyerTotalAmount?: number;
  platformSubsidyAmount?: number;
  itemSubtotal?: number;
  inboundShippingFee?: number;
  outboundShippingFee?: number;
};

export function MemberAuthOrderInvoice({
  finalPrice,
  isSeller,
  orderId: _orderId,
  orderNumber: _orderNumber,
  escrowStatus: _escrowStatus,
  status: _status,
  releasedAmount: _releasedAmount,
  platformFee,
  authFee,
  releaseStatus: _explicitReleaseStatus,
  buyerTotalAmount,
  platformSubsidyAmount,
  itemSubtotal,
  inboundShippingFee,
  outboundShippingFee,
}: MemberAuthOrderInvoiceProps) {
  const configuredAuthFee = usePlatformAuthFee();
  const resolvedAuthFee =
    authFee != null ? authFee : (platformFee ?? configuredAuthFee);
  const inboundFee =
    inboundShippingFee != null && inboundShippingFee > 0
      ? inboundShippingFee
      : MEMBER_AUTH_SHIPPING_FEE;
  const outboundFee =
    outboundShippingFee != null && outboundShippingFee > 0
      ? outboundShippingFee
      : AUTH_ESCROW_SF_LEG_FEE_HKD;
  const resolvedSubsidy = platformSubsidyAmount ?? 0;
  const showSubsidy = resolvedSubsidy > 0;
  const cardPrice = itemSubtotal ?? finalPrice;
  const orderGrossTotal =
    cardPrice + inboundFee + outboundFee + resolvedAuthFee;
  const resolvedBuyerTotal =
    buyerTotalAmount ??
    orderGrossTotal - (showSubsidy ? resolvedSubsidy : 0);
  const sellerReceivedAmount = computeFpsNetPayoutAmount(
    computeFpsGrossPayoutHkd(cardPrice, inboundFee),
  );
  const displayPlatformFee = platformFee ?? resolvedAuthFee;

  return (
    <div className="rounded-lg border border-white/[0.08] bg-bg-card/20 p-4 space-y-3">
      <h3 className={SECTION_TITLE_CLASS}>
        帳單明細
      </h3>

      <div className="space-y-2 border-t border-white/[0.06] pt-3 font-mono text-[12px] text-text-secondary">
        <MemberOrderInvoiceRow label="商品最終成交價" amount={cardPrice} />
        <MemberOrderInvoiceRow
          label="運費（賣家寄送平台）(B)"
          amount={inboundFee}
        />
        <MemberOrderInvoiceRow
          label="運費（平台寄送買家）"
          amount={outboundFee}
        />
        <div className="flex justify-between text-brand">
          <span>鑑定服務費 (C)</span>
          <span className="font-bold">
            {"HK$ " + displayPlatformFee.toLocaleString("zh-TW")}
          </span>
        </div>
        {showSubsidy ? (
          <MemberOrderInvoiceRow
            label="平台優惠 (D)"
            amount={resolvedSubsidy}
            suffix={"-HK$ " + resolvedSubsidy.toLocaleString("zh-TW")}
            valueClassName="text-[#ef4444]"
          />
        ) : null}
        <div className="flex justify-between border-t border-white/[0.06] pt-2 font-sans text-[12px]">
          <span className="font-medium text-text-primary">總金額 (A)</span>
          <span className="font-semibold text-text-primary">
            {"HK$ " + orderGrossTotal.toLocaleString("zh-TW")}
          </span>
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-white/[0.06] pt-3 font-sans text-[14px]">
          <span className="font-semibold text-text-primary">
            {isSeller ? (
              <>
                最終實收總額
                <span className="ml-1.5 font-mono text-[11px] font-normal text-text-disabled">
                  (商品最終成交價 + B)
                </span>
              </>
            ) : showSubsidy ? (
              <>
                最終扣款總額
                <span className="ml-1.5 font-mono text-[11px] font-normal text-text-disabled">
                  (A − D)
                </span>
              </>
            ) : (
              "最終扣款總額"
            )}
          </span>
          <span className="font-mono text-[18px] font-bold text-brand sm:text-[20px]">
            {isSeller
              ? "HK$ " + sellerReceivedAmount.toLocaleString("zh-TW")
              : "HK$ " + resolvedBuyerTotal.toLocaleString("zh-TW")}
          </span>
        </div>
      </div>
    </div>
  );
}
