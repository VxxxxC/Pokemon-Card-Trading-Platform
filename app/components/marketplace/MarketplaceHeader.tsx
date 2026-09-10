"use client";

import Link from "next/link";
import {
  MARKETPLACE_QUICK_CATEGORIES,
  marketplaceHrefForQuickCategory,
} from "@/lib/marketplace/quick-categories";

function SearchIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="#8c7355"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

export function MarketplaceHeader() {
  return (
    <div className="sticky top-0 z-30 bg-[#17130f]/95 backdrop-blur-md border-b border-[rgba(140,115,85,0.12)] px-4 pt-4 pb-3 space-y-3">
      <div className="flex items-baseline gap-2">
        <h1 className="font-sans font-bold text-[20px] text-[#eae1da] tracking-tight">
          市場
        </h1>
      </div>

      <div className="relative">
        <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
          <SearchIcon />
        </div>
        <Link
          href="/marketplace"
          className="block w-full h-11 pl-11 pr-4 bg-[#2B1F15] rounded-full font-mono text-[14px] text-[#8c7355]/60 border border-[rgba(140,115,85,0.20)] leading-[2.75rem]"
        >
          搜尋卡牌、盒組名稱或編號…
        </Link>
      </div>

      <div className="flex gap-2 overflow-x-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] pb-0.5">
        {MARKETPLACE_QUICK_CATEGORIES.map((cat) => (
          <Link
            key={cat.id}
            href={marketplaceHrefForQuickCategory(cat.id)}
            className="flex-shrink-0 h-8 px-3.5 rounded-full font-mono text-[12px] font-medium transition-all active:scale-[0.96] bg-[#3A2F1F] text-[#d4c4b7] border border-transparent hover:border-[#8c7355]/30"
          >
            {cat.label}
          </Link>
        ))}
      </div>
    </div>
  );
}
