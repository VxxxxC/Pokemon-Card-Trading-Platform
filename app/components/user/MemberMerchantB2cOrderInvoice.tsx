"use client";

import { MemberOrderInvoiceRow } from "@/app/components/user/member-order-invoice-row";
import { SECTION_TITLE_CLASS } from "@/lib/ui/section-title-ui";

type MemberMerchantB2cOrderInvoiceProps = {
  itemSubtotal: number;
  shippingFee: number;
  shippingMethod: string | null;
  totalAmount: number;
  isSeller: boolean;
  authFee?: number;
};

function formatShippingMethodLabel(method: string | null): string {
  if (method === "sf") {
    return "快遞寄貨";
  }
  if (method === "meetup") {
    return "面交自取";
  }
  return "—";
}

export function MemberMerchantB2cOrderInvoice({
  itemSubtotal,
  shippingFee,
  shippingMethod,
  totalAmount,
  isSeller,
  authFee = 0,
}: MemberMerchantB2cOrderInvoiceProps) {
  return (
    <div className="rounded-lg border border-white/[0.08] bg-bg-card/20 p-4 space-y-3">
      <h3 className={SECTION_TITLE_CLASS}>
        帳單明細
      </h3>

      <div className="space-y-2 border-t border-white/[0.06] pt-3 font-mono text-[12px] text-text-secondary">
        <MemberOrderInvoiceRow label="商品成交價" amount={itemSubtotal} />
        <MemberOrderInvoiceRow
          label={`運費（${formatShippingMethodLabel(shippingMethod)}）`}
          amount={shippingFee}
        />
        {authFee > 0 ? (
          <div className="flex justify-between text-brand">
            <span>官方第三方鑑定費</span>
            <span className="font-bold">
              {"HK$ " + authFee.toLocaleString("zh-TW")}
            </span>
          </div>
        ) : null}

        <div className="flex items-center justify-between gap-2 border-t border-white/[0.06] pt-3 font-sans text-[14px]">
          <span className="font-semibold text-text-primary">
            {isSeller ? "買家付款總額" : "託管付款總額"}
          </span>
          <span
            className="font-mono text-[18px] font-bold text-brand sm:text-[20px]"
            data-testid="order-payment-amount"
          >
            {"HK$ " + totalAmount.toLocaleString("zh-TW")}
          </span>
        </div>
      </div>
    </div>
  );
}
