"use client";

import { RotateCcw, SearchX } from "lucide-react";
import { SECTION_TITLE_CLASS } from "@/lib/ui/section-title-ui";

interface MarketplaceEmptyStateProps {
  hasActiveFilters?: boolean;
  query?: string;
  onResetFilters?: () => void;
}

export function MarketplaceEmptyState({
  hasActiveFilters = false,
  query = "",
  onResetFilters,
}: MarketplaceEmptyStateProps) {
  const trimmedQuery = query.trim();

  return (
    <div className="rounded-xl border border-white/[0.06] bg-[#26211C] px-4 py-10 sm:py-12 text-center">
      <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-xl border border-brand/20 bg-[#1A1612]">
        <SearchX className="h-7 w-7 text-brand/70" aria-hidden />
      </div>

      <h2 className={SECTION_TITLE_CLASS}>
        {hasActiveFilters ? "找不到符合條件的現貨" : "大盤暫無現貨標的"}
      </h2>

      <p className="font-sans text-[12px] sm:text-[13px] text-[#8A8680] mt-2 max-w-md mx-auto leading-relaxed">
        {hasActiveFilters ? (
          <>
            {trimmedQuery ? (
              <>
                搜尋「<span className="text-brand">{trimmedQuery}</span>」沒有匹配結果。
              </>
            ) : (
              <>目前的篩選條件過於嚴格，請嘗試放寬條件。</>
            )}
            <br />
            <span className="font-mono text-[10px] text-[#8A8680]/80">
              僅顯示已有 active listing 的商品目錄項目
            </span>
          </>
        ) : (
          <>
            目前尚無上架中的卡牌或商品。
            <br />
            <span className="font-mono text-[10px] text-[#8A8680]/80">
              成為第一個賣家，或稍後再來看看
            </span>
          </>
        )}
      </p>

      {hasActiveFilters && onResetFilters && (
        <button
          type="button"
          onClick={onResetFilters}
          className="mt-5 inline-flex items-center gap-2 h-9 px-4 rounded-lg font-sans font-bold text-[12px] border border-brand/40 text-brand bg-[rgba(212,165,116,0.06)] hover:border-brand hover:bg-[rgba(212,165,116,0.1)] transition-all active:scale-[0.97]"
        >
          <RotateCcw className="h-3.5 w-3.5 shrink-0" aria-hidden />
          清除所有篩選
        </button>
      )}
    </div>
  );
}
