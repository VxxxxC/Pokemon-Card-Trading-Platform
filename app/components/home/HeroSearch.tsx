"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { CheckInCard } from "@/app/components/rewards/CheckInCard";
import { useIsMemberPersonaActive } from "@/app/lib/hooks/useIsMemberPersonaActive";
import { useHeroMarketplaceSearch } from "@/app/lib/hooks/useHeroMarketplaceSearch";
import type { MarketplaceProductRow } from "@/app/lib/marketplace/types";
import { cn } from "@/lib/utils";
import { SECTION_TITLE_CLASS } from "@/lib/ui/section-title-ui";

function formatPrice(value: number): string {
  return `HK$ ${value.toLocaleString()}`;
}

function suggestionQuery(product: MarketplaceProductRow): string {
  return (
    product.displayId ??
    (product.cardNumber
      ? `${product.setCode}-${product.cardNumber}`
      : product.productName)
  );
}

export function HeroSearch({ showCheckIn = false }: { showCheckIn?: boolean }) {
  const router = useRouter();
  const searchContainerRef = useRef<HTMLDivElement>(null);
  const isMemberPersonaActive = useIsMemberPersonaActive();
  const showCheckInCard = showCheckIn && isMemberPersonaActive;

  const {
    query,
    setQuery,
    results,
    total,
    isSearching,
    error,
    isDropdownOpen,
    closeDropdown,
    searchNow,
    hasMore,
  } = useHeroMarketplaceSearch();

  const showDropdown =
    isDropdownOpen &&
    (isSearching ||
      error !== null ||
      results.length > 0 ||
      (query.trim().length >= 2 && !isSearching));

  const executeSearch = () => {
    const trimmed = query.trim();
    searchNow();
    closeDropdown();

    if (trimmed) {
      router.push(`/marketplace?q=${encodeURIComponent(trimmed)}`);
      return;
    }

    router.push("/marketplace");
  };

  const handleSelectSuggestion = (product: MarketplaceProductRow) => {
    const q = suggestionQuery(product);
    setQuery(q);
    closeDropdown();
    router.push(`/marketplace?q=${encodeURIComponent(q)}`);
  };

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        searchContainerRef.current &&
        !searchContainerRef.current.contains(event.target as Node)
      ) {
        closeDropdown();
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [closeDropdown]);

  const heroPadding = showCheckInCard
    ? "px-3 py-3 sm:px-4 sm:py-4 lg:px-6 lg:py-5"
    : "px-3 py-2.5 sm:px-4 sm:py-3 lg:px-6 lg:py-3.5";

  return (
    <section
      className="relative mt-3 rounded-[12px] overflow-hidden bg-bg-card border border-[rgba(237,232,224,0.08)]"
      aria-labelledby="hero-search-heading"
    >
      <div className="absolute inset-0 bg-gradient-to-br from-[rgba(212,165,116,0.06)] via-transparent to-[rgba(212,165,116,0.03)]" />

      <div className={`relative z-10 ${heroPadding}`}>
        <div
          className={
            showCheckInCard
              ? "lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(280px,340px)] lg:gap-6 lg:items-start"
              : undefined
          }
        >
          <div className="min-w-0">
            <h1
              id="hero-search-heading"
              className={cn(
                SECTION_TITLE_CLASS,
                showCheckInCard ? "mb-2.5" : "mb-1.5",
              )}
            >
              搜尋你的目標卡牌
            </h1>

            <div
              ref={searchContainerRef}
              className="relative flex flex-row items-center gap-2 max-w-2xl"
            >
            <div className="flex-1 relative">
              <SearchIcon />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onFocus={() => setQuery(query)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    executeSearch();
                  }
                }}
                placeholder="輸入卡牌編號 (例: SV8a-123)"
                className={`w-full pl-9 pr-3 bg-bg-elevated border border-[rgba(237,232,224,0.12)] rounded-[8px] font-sans text-[13px] text-text-primary placeholder:text-text-disabled focus:outline-none focus:ring-2 focus:ring-[rgba(140,115,85,0.40)] ${
                  showCheckInCard ? "h-10" : "h-9"
                }`}
                aria-label="搜尋卡牌編號"
                autoComplete="off"
              />

              {showDropdown && (
                <div
                  id="hero-search-results"
                  role="listbox"
                  aria-label="搜尋建議"
                  className="absolute z-50 top-full mt-1 w-full max-h-72 overflow-y-auto rounded-[8px] border border-[rgba(237,232,224,0.12)] bg-bg-elevated shadow-lg"
                >
                  {isSearching && (
                    <p className="px-3 py-2 font-mono text-[11px] text-text-disabled">
                      搜尋現貨中…
                    </p>
                  )}
                  {error && (
                    <p className="px-3 py-2 font-mono text-[11px] text-warning">
                      {error}
                    </p>
                  )}
                  {!isSearching &&
                    !error &&
                    results.length === 0 &&
                    query.trim().length >= 2 && (
                      <p className="px-3 py-2 font-mono text-[11px] text-text-disabled">
                        暫無符合的現貨標的
                      </p>
                    )}
                  {results.map((product) => (
                    <button
                      key={product.productId}
                      type="button"
                      onClick={() => handleSelectSuggestion(product)}
                      className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-[rgba(212,165,116,0.08)] border-b border-[rgba(237,232,224,0.08)] last:border-b-0"
                    >
                      <div className="relative w-10 h-14 shrink-0 rounded-md overflow-hidden bg-bg-card border border-[rgba(237,232,224,0.08)]">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={product.imageUrl}
                          alt={product.productName}
                          width={40}
                          height={56}
                          className="h-full w-full object-cover"
                          loading="lazy"
                        />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-sans text-[13px] text-text-primary truncate">
                          {product.productName}
                        </p>
                        <p className="font-mono text-[10px] text-text-disabled truncate mt-0.5">
                          {[
                            product.displayId ??
                              `${product.setCode}${product.cardNumber ? `-${product.cardNumber}` : ""}`,
                            product.rarity,
                            product.gradingCompany !== "RAW"
                              ? `${product.gradingCompany} ${product.gradingScore ?? ""}`.trim()
                              : "裸卡",
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="font-mono text-[12px] font-bold text-brand">
                          {formatPrice(product.lowestPrice)}
                        </p>
                        {product.listingCount > 1 && (
                          <p className="font-mono text-[9px] text-text-disabled">
                            {product.listingCount} 件現貨
                          </p>
                        )}
                      </div>
                    </button>
                  ))}
                  {hasMore && (
                    <p className="px-3 py-2 font-mono text-[10px] text-text-disabled border-t border-[rgba(237,232,224,0.08)] leading-relaxed">
                      顯示最相關的 {results.length} 筆，共{" "}
                      {total.toLocaleString()} 件現貨 — 按 Enter
                      查看全部結果
                    </p>
                  )}
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={executeSearch}
              disabled={isSearching}
              className={`inline-flex items-center justify-center shrink-0 px-3.5 sm:px-5 bg-brand text-[#17130f] font-sans font-semibold text-[12px] rounded-[8px] active:scale-[0.98] transition-transform hover:bg-brand-hover cursor-pointer focus:outline-none disabled:opacity-70 ${
                showCheckInCard ? "h-10" : "h-9"
              }`}
            >
              {isSearching ? "搜尋中…" : "搜尋"}
            </button>
            </div>
          </div>

          {showCheckInCard ? (
            <div
              className="mt-4 border-t border-white/[0.08] pt-4 lg:mt-0 lg:border-t-0 lg:pt-0 lg:border-l lg:border-white/[0.08] lg:pl-6"
              aria-labelledby="hero-checkin-heading"
            >
              <h2 id="hero-checkin-heading" className="sr-only">
                每日簽到
              </h2>
              <CheckInCard deferStatsLoad embedded />
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function SearchIcon() {
  return (
    <svg
      className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-disabled"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
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
