"use client";

import Link from "next/link";
import { Rocket, Store } from "lucide-react";

type MerchantPromoBannerProps = {
  className?: string;
};

export function MerchantPromoBanner({ className = "" }: MerchantPromoBannerProps) {
  return (
    <Link
      href="/auth?role=merchant"
      className={`group flex items-center gap-3 rounded-xl border border-brand/25 bg-gradient-to-r from-[rgba(212,165,116,0.12)] via-[rgba(212,165,116,0.06)] to-transparent px-3 py-2.5 sm:px-4 sm:py-3 hover:border-brand/40 transition-colors ${className}`}
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand/15 text-brand">
        <Store className="h-4 w-4" aria-hidden />
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-sans font-bold text-[12px] sm:text-[13px] text-[#eae1da] leading-tight">
          申請註冊成為認證商戶
        </p>
        <p className="font-sans text-[10px] sm:text-[11px] text-[#8A8680] mt-0.5 truncate">
          解鎖專業商家席位，享受頂級牌組道館交易體驗
        </p>
      </div>
      <span className="hidden sm:inline-flex shrink-0 items-center gap-1 h-8 px-3 rounded-lg bg-brand text-[#1A1612] font-sans font-bold text-[11px] group-hover:bg-[#e0b88a] transition-colors">
        申請入駐
        <Rocket className="h-3.5 w-3.5" aria-hidden />
      </span>
    </Link>
  );
}
