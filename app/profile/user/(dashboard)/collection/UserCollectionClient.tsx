"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Search, X } from "lucide-react";
import { DASHBOARD_SECTION_TITLE_CLASS } from "@/app/profile/dashboard-ui";
import { WishlistTable } from "@/app/components/market/WishlistTable";
import { CollectionTable } from "@/app/components/market/CollectionTable";
import { useWishlist } from "@/app/lib/hooks/useWishlist";
import {
  COLLECTION_FILTER_LABELS,
  useCollection,
  type CollectionInitialData,
} from "@/app/lib/hooks/useCollection";
import { useUIStore } from "@/app/store/useUIStore";
import { useIsMemberPersonaActive } from "@/app/lib/hooks/useIsMemberPersonaActive";
import { MEMBER_PERSONA_FEATURES_BLOCKED_ERROR } from "@/lib/auth/member-persona-features";
import { SmartSearch } from "@/app/components/marketplace/filters/SmartSearch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const WISHLIST_SORT_OPTIONS = [
  { value: "name", label: "按卡名排序" },
  { value: "recent", label: "最新加入" },
] as const;

type UserCollectionClientProps = {
  initialData: CollectionInitialData;
  bootstrapError?: string;
};

export function UserCollectionClient({
  initialData,
  bootstrapError,
}: UserCollectionClientProps) {
  const router = useRouter();
  const isMemberPersonaActive = useIsMemberPersonaActive();
  const [activeFilter, setActiveFilter] = useState("全部");
  const [wishlistSort, setWishlistSort] = useState<"name" | "recent">("name");
  const [query, setQuery] = useState("");
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [odometerValue, setOdometerValue] = useState(
    initialData.summary?.totalMarketValue ?? 0,
  );

  const listFilter = COLLECTION_FILTER_LABELS[activeFilter] ?? "all";

  const {
    entries: collectionEntries,
    total: collectionTotal,
    page: collectionPage,
    pageSize: collectionPageSize,
    totalPages: collectionTotalPages,
    summary,
    isLoading: isCollectionLoading,
    isSummaryLoading,
    isRefreshing,
    setPage: setCollectionPage,
    removeEntry: removeCollectionEntry,
    updateGrade: updateCollectionGrade,
    refetch: refetchCollection,
  } = useCollection({
    filter: listFilter,
    query,
    initialData,
  });

  const {
    entries: wishlistEntries,
    isLoading: isWishlistLoading,
    removeEntry: removeWishlistEntry,
    updateTargetPrice,
    updateGrade,
  } = useWishlist({ deferLoad: true });

  const wishlistSortLabel =
    WISHLIST_SORT_OPTIONS.find((option) => option.value === wishlistSort)
      ?.label ?? "排序";

  const sortedWishlistEntries = useMemo(() => {
    if (wishlistSort === "recent") {
      return wishlistEntries;
    }

    return [...wishlistEntries].sort((left, right) =>
      left.name.localeCompare(right.name, "zh-Hant"),
    );
  }, [wishlistEntries, wishlistSort]);

  const openAddAssetModal = useUIStore((state) => state.openAddAssetModal);

  useEffect(() => {
    if (!isMemberPersonaActive) {
      toast.error(MEMBER_PERSONA_FEATURES_BLOCKED_ERROR);
      router.replace("/profile/merchant");
    }
  }, [isMemberPersonaActive, router]);

  useEffect(() => {
    const handleRefresh = () => {
      refetchCollection();
    };
    window.addEventListener("collection-should-refresh", handleRefresh);
    return () => {
      window.removeEventListener("collection-should-refresh", handleRefresh);
    };
  }, [refetchCollection]);

  const portfolioSummary = useMemo(() => {
    if (!summary) {
      return {
        totalValue: 0,
        unrealizedPnl: 0,
        pnlPercent: 0,
        cardCount: 0,
        gradedCount: 0,
        rawCount: 0,
        listedCount: 0,
      };
    }

    return {
      totalValue: summary.totalMarketValue,
      unrealizedPnl: summary.unrealizedPnl,
      pnlPercent: summary.pnlPercent,
      cardCount: summary.cardCount,
      gradedCount: summary.gradedCount,
      rawCount: summary.rawCount,
      listedCount: summary.listedCount,
    };
  }, [summary]);

  useEffect(() => {
    let start = 0;
    const end = portfolioSummary.totalValue;
    const duration = 1000;
    const increment = Math.ceil(end / (duration / 16)) || 1;

    const timer = setInterval(() => {
      start += increment;
      if (start >= end) {
        clearInterval(timer);
        setOdometerValue(end);
      } else {
        setOdometerValue(start);
      }
    }, 16);

    return () => clearInterval(timer);
  }, [portfolioSummary.totalValue]);

  const emptyCollectionMessage = query
    ? `找不到包含「${query}」的${listFilter === "sealed" ? "密封盒組" : "卡牌"}`
    : listFilter === "sealed"
      ? "此篩選條件下沒有密封盒組"
      : "此篩選條件下沒有卡牌";

  const showCollectionLoading =
    isCollectionLoading && collectionEntries.length === 0;

  return (
    <div className="space-y-4">
      {bootstrapError ? (
        <div className="px-4 py-3 bg-[rgba(239,68,68,0.06)] border border-warning/25 rounded-xl">
          <p className="font-sans text-[13px] text-warning">
            無法載入收藏庫：{bootstrapError}
          </p>
        </div>
      ) : null}

      <section
        aria-labelledby="portfolio-heading"
        className="rounded-xl overflow-hidden bg-bg-card border border-[rgba(237,232,224,0.08)]"
      >
        <h2 id="portfolio-heading" className="sr-only">總身家估值</h2>
        <div className="px-4 pt-4 pb-3 sm:px-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-mono text-[10px] text-text-secondary uppercase tracking-wider">
                總身家估值
              </p>
              <p className="font-mono font-bold text-[20px] sm:text-[24px] text-brand leading-tight mt-1 tabular-nums">
                {isSummaryLoading ? (
                  <span className="text-text-disabled text-[18px]">載入中…</span>
                ) : (
                  <>HK$ {odometerValue.toLocaleString("en-HK")}</>
                )}
              </p>
              <p
                className={`font-mono text-[11px] mt-1 inline-flex items-center gap-1 font-semibold ${portfolioSummary.unrealizedPnl >= 0 ? "text-success" : "text-error"}`}
              >
                {portfolioSummary.unrealizedPnl >= 0 ? "▲" : "▼"} HK$
                {Math.abs(portfolioSummary.unrealizedPnl).toLocaleString("en-HK")}
                <span className="text-text-disabled font-normal">
                  ({portfolioSummary.unrealizedPnl >= 0 ? "+" : ""}
                  {portfolioSummary.pnlPercent}% 未實現)
                </span>
              </p>
              <p className="hidden sm:block font-mono text-[10px] text-text-disabled mt-2 leading-relaxed">
                SNKRDUNK → 平台成交 → 入手價（卡牌跟 grading；盒組跟密封/已開封）
              </p>
            </div>
            <button
              type="button"
              onClick={() => openAddAssetModal({ mode: "hobby" })}
              className="flex items-center gap-1 px-2.5 h-8 bg-brand hover:bg-brand-hover text-[#1A1612] font-sans text-[11px] font-semibold rounded-lg active:scale-[0.98] transition-all shrink-0 cursor-pointer focus:outline-none"
            >
              <Plus className="h-3 w-3 shrink-0" aria-hidden />
              <span className="hidden sm:inline">收錄新卡</span>
              <span className="sm:hidden">收錄</span>
            </button>
          </div>
        </div>
        <div className="flex border-t border-[rgba(237,232,224,0.06)] divide-x divide-[rgba(237,232,224,0.06)]">
          {[
            { label: "持有", value: portfolioSummary.cardCount },
            { label: "已鑑定", value: portfolioSummary.gradedCount },
            { label: "裸卡", value: portfolioSummary.rawCount },
            { label: "已上架", value: portfolioSummary.listedCount },
          ].map(({ label, value }) => (
            <div key={label} className="flex-1 min-w-0 px-2 py-2.5 sm:px-3 sm:py-3 text-center sm:text-left">
              <p className="font-mono text-[9px] sm:text-[10px] text-text-secondary truncate">
                {label}
              </p>
              <p className="font-mono font-semibold text-[13px] sm:text-[15px] text-text-primary mt-0.5 tabular-nums">
                {isSummaryLoading ? "—" : value}
              </p>
            </div>
          ))}
        </div>
      </section>

      <div className="relative hidden lg:block">
        <div className="relative flex items-center">
          <Search
            className="absolute left-3 h-4 w-4 text-text-disabled pointer-events-none"
            aria-hidden
          />
          <input
            type="search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setIsSearchOpen(false);
            }}
            placeholder="搜尋卡牌名稱、編號…"
            className="w-full h-10 pl-9 pr-9 bg-bg-card border border-[rgba(237,232,224,0.08)] rounded-lg font-sans text-[13px] text-text-primary placeholder:text-text-disabled focus:outline-none focus:border-brand/30 transition-colors"
          />
          {query ? (
            <button
              type="button"
              onClick={() => {
                setQuery("");
                setIsSearchOpen(false);
              }}
              className="absolute right-3 text-text-disabled hover:text-text-primary transition-colors focus:outline-none"
              aria-label="清除搜尋"
            >
              <X className="h-3.5 w-3.5" aria-hidden />
            </button>
          ) : null}
        </div>
        <SmartSearch
          query={query}
          listings={[]}
          isOpen={isSearchOpen}
          onSelect={(name) => {
            setQuery(name);
            setIsSearchOpen(false);
          }}
        />
      </div>

      <div className={isRefreshing ? "opacity-80 pointer-events-none" : ""}>
        <section aria-labelledby="cards-heading" className="space-y-3">
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <h2
                id="cards-heading"
                className={`${DASHBOARD_SECTION_TITLE_CLASS} min-w-0 truncate`}
              >
                我的持有卡牌庫
              </h2>
              <span
                className="font-mono text-[12px] text-text-disabled shrink-0"
                aria-label={`共 ${collectionTotal} 張卡牌結果`}
              >
                <data value={collectionTotal} className="not-italic" aria-hidden="true">
                  {collectionTotal}
                </data>
                <span aria-hidden="true"> 結果</span>
              </span>
            </div>
            <div className="flex gap-1 overflow-x-auto scrollbar-none pb-0.5">
              {["全部", "已鑑定", "裸卡", "密封盒組", "已上架", "已售出"].map((f) => (
                <button
                  key={f}
                  onClick={() => setActiveFilter(f)}
                  type="button"
                  className={`shrink-0 font-mono text-[10px] px-2.5 py-1 rounded-md border transition-colors ${activeFilter === f ? "text-brand border-brand/40 bg-brand/10" : "text-text-secondary border-[rgba(237,232,224,0.08)] hover:text-text-primary"}`}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>

          <div className="bg-bg-card rounded-xl border border-[rgba(237,232,224,0.08)] px-3 py-1 sm:px-4 overflow-hidden">
            <CollectionTable
              entries={collectionEntries}
              isLoading={showCollectionLoading}
              emptyMessage={emptyCollectionMessage}
              currentPage={collectionPage}
              totalPages={collectionTotalPages}
              totalItems={collectionTotal}
              itemsPerPage={collectionPageSize}
              onPageChange={setCollectionPage}
              onRemove={async (entry) => {
                await removeCollectionEntry(entry);
              }}
              onUpdateGrade={updateCollectionGrade}
            />
          </div>
        </section>
      </div>

      <section aria-labelledby="wishlist-heading" className="mt-5">
        <div className="flex items-center justify-between gap-3 mb-3">
          <h2
            id="wishlist-heading"
            className={`${DASHBOARD_SECTION_TITLE_CLASS} min-w-0 truncate`}
          >
            追蹤願望清單
          </h2>
          <Select
            value={wishlistSort}
            onValueChange={(value) =>
              setWishlistSort(value as "name" | "recent")
            }
          >
            <SelectTrigger
              aria-label="願望清單排序"
              className="h-8 w-[104px] shrink-0 rounded-lg border border-[rgba(237,232,224,0.08)] bg-bg-page/60 px-2.5 font-mono text-[10px] text-text-secondary hover:border-brand/30 hover:text-text-primary focus-visible:ring-0 focus-visible:border-brand/40"
            >
              <SelectValue placeholder="排序">{wishlistSortLabel}</SelectValue>
            </SelectTrigger>
            <SelectContent
              className="bg-bg-card border border-[rgba(237,232,224,0.08)] rounded-lg font-mono text-[11px] shadow-2xl"
            >
              {WISHLIST_SORT_OPTIONS.map((option) => (
                <SelectItem
                  key={option.value}
                  value={option.value}
                  className="focus:bg-brand/10 focus:text-brand cursor-pointer"
                >
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="bg-bg-card rounded-xl border border-[rgba(237,232,224,0.08)] px-3 py-1 sm:px-4 overflow-hidden">
          <WishlistTable
            key={wishlistSort}
            entries={sortedWishlistEntries}
            isLoading={isWishlistLoading}
            onRemove={async (entry) => {
              await removeWishlistEntry(entry);
            }}
            onUpdateTarget={updateTargetPrice}
            onUpdateGrade={updateGrade}
          />
        </div>
      </section>
    </div>
  );
}
