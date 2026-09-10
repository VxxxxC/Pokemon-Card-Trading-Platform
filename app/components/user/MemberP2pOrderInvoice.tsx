"use client";

import { cn } from "@/lib/utils";

type MemberP2pOrderInvoiceProps = {
  finalPrice: number;
  isSeller: boolean;
};

export function MemberP2pOrderInvoice({
  finalPrice,
  isSeller,
}: MemberP2pOrderInvoiceProps) {
  return (
    <div className="p-5 bg-[#26211C] border border-[rgba(237,232,224,0.08)] rounded-2xl space-y-4 shadow-md animate-fadeIn">
      <div className="flex items-center justify-between pb-2">
        <h3 className="font-sans font-extrabold text-[14.5px] text-[#eae1da]">
          交易資產最終交收電子收據
        </h3>
        <span
          className={cn(
            "font-sans text-[10px] font-black tracking-wide uppercase px-2 py-0.5 rounded border",
            isSeller
              ? "text-[#10b981] bg-[#10b981]/10 border-[#10b981]/30 shadow-[0_0_12px_rgba(16,185,129,0.15)]"
              : "text-[#38bdf8] bg-[#38bdf8]/10 border-[#38bdf8]/30 shadow-[0_0_12px_rgba(56,189,248,0.15)]",
          )}
        >
          {isSeller ? "賣出交易" : "買入交易"}
        </span>
      </div>

      <div className="border-t border-[rgba(237,232,224,0.06)] font-mono text-[12px] space-y-2 text-text-secondary">
        <div className="flex justify-between">
          <span>商品最終成交價</span>
          <span className="text-text-primary">
            {"HK$ " + finalPrice.toLocaleString("zh-TW")}
          </span>
        </div>

        <div className="border-t border-[rgba(237,232,224,0.08)] pt-3 flex justify-between items-center text-[#eae1da] font-black text-[14px] md:text-[16px]">
          <span>{isSeller ? "最終實收總額" : "最終扣款總額"}</span>
          <span className="text-brand font-mono text-[18px] md:text-[24px]">
            {"HK$ " + finalPrice.toLocaleString("zh-TW")}
          </span>
        </div>
      </div>
    </div>
  );
}
