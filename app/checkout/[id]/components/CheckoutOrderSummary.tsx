"use client";

import type { CheckoutSession } from "@/lib/checkout/types";
import { SECTION_TITLE_CLASS } from "@/lib/ui/section-title-ui";

type CheckoutOrderSummaryProps = {
  session: CheckoutSession;
  shippingFee: number;
  inboundShippingFee?: number;
  outboundShippingFee?: number;
  authFee: number;
  totalAmount: number;
  shippingLabel?: string;
  showShippingRow?: boolean;
  showAuthEscrowShippingRows?: boolean;
  showAuthFeeRow?: boolean;
  platformSubsidyAmount?: number;
  extraShippingNote?: string | null;
  children?: React.ReactNode;
};

export function CheckoutOrderSummary({
  session,
  shippingFee,
  inboundShippingFee = 0,
  outboundShippingFee = 0,
  authFee,
  totalAmount,
  shippingLabel = "運費",
  showShippingRow = true,
  showAuthEscrowShippingRows = false,
  showAuthFeeRow = true,
  platformSubsidyAmount = 0,
  extraShippingNote,
  children,
}: CheckoutOrderSummaryProps) {
  return (
    <div className="rounded-lg border border-white/[0.08] bg-bg-card/20 p-4 space-y-4">
      <h3 className={`${SECTION_TITLE_CLASS} border-b border-white/[0.06] pb-2`}>
        帳單明細
      </h3>

      <div className="space-y-2 font-mono text-[12px] text-text-secondary">
        <div className="flex justify-between gap-3">
          <span>卡牌商品總額</span>
          <span className="text-text-primary">
            HK$ {session.pricing.itemSubtotal.toLocaleString()}
          </span>
        </div>
        {showShippingRow ? (
          <div className="flex justify-between gap-3">
            <span>{shippingLabel}</span>
            <span className="text-text-primary">HK$ {shippingFee}</span>
          </div>
        ) : null}
        {showAuthEscrowShippingRows ? (
          <>
            <div className="flex justify-between gap-3">
              <span>運費（賣家寄送平台）</span>
              <span className="text-text-primary">
                HK$ {inboundShippingFee}
              </span>
            </div>
            <div className="flex justify-between gap-3">
              <span>運費（平台寄送買家）</span>
              <span className="text-text-primary">
                HK$ {outboundShippingFee}
              </span>
            </div>
          </>
        ) : null}
        {extraShippingNote ? (
          <p className="font-sans text-[10.5px] text-text-disabled">
            {extraShippingNote}
          </p>
        ) : null}
        {showAuthFeeRow ? (
          <div className="flex justify-between gap-3 text-brand">
            <span>官方第三方鑑定費</span>
            <span className="font-semibold">HK$ {authFee}</span>
          </div>
        ) : null}
        {platformSubsidyAmount > 0 ? (
          <div className="flex justify-between gap-3 text-[#ef4444]">
            <span>平台優惠</span>
            <span className="font-semibold">
              - HK$ {platformSubsidyAmount.toLocaleString()}
            </span>
          </div>
        ) : null}
        <div className="flex justify-between items-center gap-3 border-t border-white/[0.06] pt-3 font-sans text-[14px]">
          <span className="font-semibold text-text-primary">付款總額</span>
          <span className="font-mono text-[20px] font-bold text-brand">
            HK$ {totalAmount.toLocaleString()}
          </span>
        </div>
      </div>

      <p className="font-sans text-[10.5px] text-text-disabled leading-relaxed rounded-lg border border-white/[0.06] bg-[#17130f] px-3 py-2.5">
        款項由 Stripe 託管鎖定；確認收貨前賣方無法提現。
      </p>

      {children}
    </div>
  );
}
