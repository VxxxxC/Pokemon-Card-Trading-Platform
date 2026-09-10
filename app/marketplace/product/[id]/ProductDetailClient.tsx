"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { useUIStore } from "@/app/store/useUIStore";
import { Pagination } from "@/app/components/ui/Pagination";
import Image from "next/image";
import { RarityBadge } from "@/app/components/cards/RarityBadge";
import { GradeBadge } from "@/app/components/cards/GradeBadge";
import { AskOrderBookRow } from "@/app/components/marketplace/AskOrderBookRow";
import {
  getMarketplaceProductListings,
} from "@/app/actions/marketplace";
import {
  MarketChartSkeleton,
  MarketIndexSkeleton,
} from "@/app/components/shared/MarketSkeletons";
import { ProductMarketDataEmptyPanel } from "./ProductMarketDataEmptyPanel";
import type {
  MarketplaceMarketPriceGradeRow,
  MarketplaceProductDetail,
} from "@/app/lib/marketplace/types";
import type { MarketplaceProductListingsInitialData } from "@/app/lib/hooks/useMarketplaceProductListings";
import type { SellOrder } from "@/app/lib/mock-data/cards";
import { useMarketplaceProductListings } from "@/app/lib/hooks/useMarketplaceProductListings";
import { useMarketplaceProductMarketPrice } from "@/app/lib/hooks/useMarketplaceProductMarketPrice";
import { useMarketplaceProductTradeHistory } from "@/app/lib/hooks/useMarketplaceProductTradeHistory";
import { formatElementTypeZh } from "@/lib/catalog/element-types";
import { isSealedCatalogType } from "@/lib/catalog/item-kind";
import { GRADING_OPTIONS } from "@/lib/grading/options";
import { resolveGradingOptionId } from "@/lib/grading/resolve-option-id";
import { MARKETPLACE_SEAL_STATE_OPTIONS } from "@/lib/marketplace/filter-options";
import { formatListingGrade } from "@/lib/marketplace/listing-display";
import { buildOrderBookExecutionPayload } from "@/lib/marketplace/map-listing-to-execution";
import { resolveProductDetailWishlistGrade } from "@/lib/wishlist/product-detail-grade";
import {
  WishlistButton,
  isWishlistFavored,
} from "@/app/components/market/WishlistButton";
import { RelativeDateTime } from "@/components/shared/RelativeDateTime";
import type { ProductListingSortKey } from "@/app/lib/marketplace/types";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  collectListingGradeOptionIds,
  isRawGradingOptionId,
} from "@/lib/marketplace/collect-listing-grade-ids";
import Link from "next/link";
import { HeaderBreadcrumbNav } from "@/app/components/navigation/HeaderBreadcrumbNav";
import { TrustBanner } from "@/app/components/home/TrustBanner";
import { IoTrendingDown, IoTrendingUp } from "react-icons/io5";
import {
  PRODUCT_DETAIL_PANEL_CLASS,
  PRODUCT_DETAIL_SECTION_TITLE_CLASS,
} from "./product-detail-ui";

const ProductPriceChart = dynamic(
  () => import("./ProductPriceChart").then((mod) => mod.ProductPriceChart),
  {
    loading: () => <MarketChartSkeleton />,
    ssr: false,
  },
);

type SubSortKey = ProductListingSortKey;

type ProductDetailClientProps = {
  product: MarketplaceProductDetail;
  currentUserId?: string | null;
  initialListings?: MarketplaceProductListingsInitialData;
  initialMarketGrades?: MarketplaceMarketPriceGradeRow[];
  initialFavoredKeys?: string[];
};

function formatSpecValue(value: string | null | undefined): string {
  const trimmed = value?.trim();
  return trimmed ? trimmed : "—";
}

function formatBreadcrumbLabel(product: MarketplaceProductDetail): string {
  if (product.displayId?.trim()) return product.displayId.trim();
  if (product.cardNumber?.trim()) {
    return `${product.setCode}-${product.cardNumber}`.toUpperCase();
  }
  return product.setCode;
}

export function ProductDetailClient({
  product,
  currentUserId = null,
  initialListings,
  initialMarketGrades,
  initialFavoredKeys = [],
}: ProductDetailClientProps) {
  const userAuthRole = useUIStore((state) => state.userAuthRole);
  const openExecutionSlideOver = useUIStore(
    (state) => state.openExecutionSlideOver,
  );
  const isGuest = userAuthRole === "GUEST";

  const images =
    product.images.length > 0 ? product.images : [product.imageUrl];
  const breadcrumbLabel = formatBreadcrumbLabel(product);
  const heroImage = images[0];

  const [subSortKey, setSubSortKey] = useState<SubSortKey>("price_asc");
  const [onlyGraded, setOnlyGraded] = useState(false);
  const [selectedGradeFilterId, setSelectedGradeFilterId] = useState("ALL");
  const [gradeFilterSheetOpen, setGradeFilterSheetOpen] = useState(false);
  const [facetGradeIds, setFacetGradeIds] = useState<Set<string>>(() =>
    collectListingGradeOptionIds(initialListings?.listings ?? []),
  );

  const isSealedProduct = isSealedCatalogType(product.catalogType);

  const gradeFilterOptions = useMemo(
    () => {
      if (isSealedProduct) {
        return [
          { id: "ALL", label: "全部規格" },
          ...MARKETPLACE_SEAL_STATE_OPTIONS.map((option) => ({
            id: option.key,
            label: option.label,
          })),
        ];
      }

      return [
        { id: "ALL", label: "全部規格" },
        ...GRADING_OPTIONS.map((option) => ({
          id: option.id,
          label: option.label,
        })),
      ];
    },
    [isSealedProduct],
  );

  const resolvedGradeFilterId = useMemo(() => {
    if (selectedGradeFilterId === "ALL") return "ALL";
    if (onlyGraded && isRawGradingOptionId(selectedGradeFilterId)) return "ALL";
    if (!facetGradeIds.has(selectedGradeFilterId)) return "ALL";
    if (!gradeFilterOptions.some((option) => option.id === selectedGradeFilterId)) {
      return "ALL";
    }
    return selectedGradeFilterId;
  }, [
    selectedGradeFilterId,
    onlyGraded,
    facetGradeIds,
    gradeFilterOptions,
  ]);

  const [orderPageState, setOrderPageState] = useState({ page: 1, forKey: "" });
  const [historyPage, setHistoryPage] = useState(1);

  const orderFilterKey = `${subSortKey}|${String(onlyGraded)}|${resolvedGradeFilterId}`;
  const orderPage =
    orderPageState.forKey === orderFilterKey ? orderPageState.page : 1;

  const setOrderPage = (page: number) => {
    setOrderPageState({ page, forKey: orderFilterKey });
  };

  const ordersPerPage = 5;
  const historyPerPage = 5;

  const {
    listings,
    meta: listingsMeta,
    lowestPrice,
    isLoading: isListingsLoading,
    isRefreshing: isListingsRefreshing,
    error: listingsError,
  } = useMarketplaceProductListings(
    {
      productId: product.productId,
      sort: subSortKey,
      onlyGraded,
      selectedGradeFilterId: resolvedGradeFilterId,
      page: orderPage,
      pageSize: ordersPerPage,
    },
    { initialData: initialListings },
  );

  const {
    availableGrades: availableMarketGrades,
    selectedGradeKey: selectedMarketGradeKey,
    setSelectedGradeKey: setSelectedMarketGradeKey,
    marketPrice: marketPriceData,
    isLoading: isMarketPriceLoading,
    isRefreshing: isMarketPriceRefreshing,
    error: marketPriceError,
  } = useMarketplaceProductMarketPrice(
    { productId: product.productId },
    initialMarketGrades !== undefined
      ? { initialData: { grades: initialMarketGrades } }
      : undefined,
  );

  const chartPoints = useMemo(
    () =>
      marketPriceData.chartPoints.map((point, index) => ({
        day: index + 1,
        date: point.date,
        price: point.price,
      })),
    [marketPriceData.chartPoints],
  );

  const {
    tradeHistory,
    meta: tradeHistoryMeta,
    isLoading: isTradeHistoryLoading,
    error: tradeHistoryError,
  } = useMarketplaceProductTradeHistory({
    productId: product.productId,
    page: historyPage,
    pageSize: historyPerPage,
    enabled: !isGuest,
  });

  const handleMarketGradeSelect = (gradeKey: string) => {
    setSelectedMarketGradeKey(gradeKey);
    if (
      facetGradeIds.has(gradeKey) &&
      (!onlyGraded || !isRawGradingOptionId(gradeKey)) &&
      gradeFilterOptions.some((option) => option.id === gradeKey)
    ) {
      setSelectedGradeFilterId(gradeKey);
    }
  };

  const handleOnlyGradedChange = (checked: boolean) => {
    setOnlyGraded(checked);
    if (checked && isRawGradingOptionId(selectedGradeFilterId)) {
      setSelectedGradeFilterId("ALL");
    }
  };

  const wishlistGrade = useMemo(
    () =>
      resolveProductDetailWishlistGrade(
        product,
        selectedGradeFilterId,
        listings[0]
          ? {
              gradingCompany: listings[0].gradingCompany,
              gradingScore: listings[0].gradingScore,
            }
          : null,
      ),
    [product, selectedGradeFilterId, listings],
  );

  const wishlistIsFavored = isWishlistFavored(
    new Set(initialFavoredKeys),
    product.productId,
    wishlistGrade.gradingCompany,
    wishlistGrade.gradingScore,
  );

  useEffect(() => {
    let cancelled = false;
    void getMarketplaceProductListings({
      productId: product.productId,
      sort: "price_asc",
      onlyGraded: false,
      page: 1,
      pageSize: 50,
    }).then((result) => {
      if (cancelled || !result.success) return;
      setFacetGradeIds(collectListingGradeOptionIds(result.data));
    });
    return () => {
      cancelled = true;
    };
  }, [product.productId]);

  const listingGradeOptionIds = useMemo(() => {
    const ids = new Set(facetGradeIds);
    for (const row of listings) {
      ids.add(
        resolveGradingOptionId(row.gradingCompany, row.gradingScore),
      );
    }
    return ids;
  }, [facetGradeIds, listings]);

  const visibleGradeFilterOptions = useMemo(() => {
    let options = gradeFilterOptions.filter(
      (option) =>
        option.id === "ALL" || listingGradeOptionIds.has(option.id),
    );
    if (onlyGraded) {
      options = options.filter(
        (option) => option.id === "ALL" || !isRawGradingOptionId(option.id),
      );
    }
    return options;
  }, [gradeFilterOptions, listingGradeOptionIds, onlyGraded]);

  const orderBookRows = useMemo(
    () =>
      listings.map((row) => ({
        listingId: row.listingId,
        order: {
          sellerName: row.sellerName,
          sellerUsername: row.sellerUsername,
          sellerId: row.sellerId,
          sellerAvatarUrl: row.sellerAvatarUrl,
          sellerPersona: row.sellerPersona,
          price: row.price,
          sellerRating: row.sellerRating,
          reviewCount: row.sellerPublicReviewCount,
          sellerTotalTrades: row.sellerTotalTrades,
          customGrade: formatListingGrade(row.gradingCompany, row.gradingScore),
          deliverySummary: row.deliverySummary,
        } satisfies SellOrder,
      })),
    [listings],
  );

  const marketPrice = marketPriceData.marketAvgPrice;
  const marketTrend30d = marketPriceData.marketTrend30d;
  const globalBestAskPrice = lowestPrice;

  const hasAnyMarketGrades = availableMarketGrades.length > 0;
  const hasChartData = !isMarketPriceLoading && chartPoints.length > 0;
  const hasMarketAvg = marketPrice != null;

  const marketIndexTitle = "交易所現貨參考均價";
  const chartTitle = "全網 30 天成交均價走勢";
  const showCombinedMarketEmpty =
    !isMarketPriceLoading &&
    !marketPriceError &&
    !hasAnyMarketGrades;

  const productPath = `/marketplace/product/${product.productId}`;

  const selectedGradeLabel =
    visibleGradeFilterOptions.find(
      (option) => option.id === selectedGradeFilterId,
    )?.label ?? "全部規格";

  const showStandaloneBestPrice =
    globalBestAskPrice != null && orderBookRows.length === 0;

  const renderGradeFilterChip = (gradeOption: { id: string; label: string }) => {
    const isActive = selectedGradeFilterId === gradeOption.id;
    return (
      <button
        key={gradeOption.id}
        type="button"
        onClick={() => {
          setSelectedGradeFilterId(gradeOption.id);
          setGradeFilterSheetOpen(false);
        }}
        className={`font-mono text-[10px] font-bold h-7 px-2.5 rounded-md border transition-all shrink-0 active:scale-[0.96] cursor-pointer focus:outline-none ${
          isActive
            ? "bg-brand border-brand text-[#1A1612]"
            : "bg-[#1A1612] border-white/5 text-[#8A8680] hover:text-[#eae1da] hover:border-white/10"
        }`}
      >
        {gradeOption.label}
      </button>
    );
  };

  const renderMarketGradeChip = (gradeOption: {
    gradeKey: string;
    label: string;
  }) => {
    const isActive = selectedMarketGradeKey === gradeOption.gradeKey;
    return (
      <button
        key={gradeOption.gradeKey}
        type="button"
        onClick={() => handleMarketGradeSelect(gradeOption.gradeKey)}
        className={`font-mono text-[10px] font-bold h-7 px-2.5 rounded-md border transition-all shrink-0 active:scale-[0.96] cursor-pointer focus:outline-none ${
          isActive
            ? "bg-brand border-brand text-[#1A1612]"
            : "bg-[#1A1612] border-white/5 text-[#8A8680] hover:text-[#eae1da] hover:border-white/10"
        }`}
      >
        {gradeOption.label}
      </button>
    );
  };

  return (
    <div className="flex-1 w-full flex flex-col bg-[#17130f]">
      <main className="flex-1 max-w-[1100px] mx-auto w-full px-4 lg:px-8 py-4 pb-28 lg:pb-10 animate-fadeIn">
        <div className="mb-4 min-w-0">
          <HeaderBreadcrumbNav
            breadcrumb={{
              parentHref: "/marketplace",
              parentLabel: "大盤市場",
              currentLabel: breadcrumbLabel,
            }}
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 lg:gap-6 items-start">
          <section className="lg:col-span-5 lg:sticky lg:top-4 mb-4 lg:mb-0">
            <div
              className="relative w-full max-w-[200px] sm:max-w-[220px] mx-auto lg:max-w-[240px] aspect-5/7 max-h-[min(38vh,300px)] lg:max-h-[min(42vh,320px)] overflow-hidden rounded-lg bg-[#17130f]"
            >
              <Image
                src={heroImage}
                alt={`${product.nameJa} 官方圖鑑`}
                fill
                priority
                className="object-contain bg-[#17130f]"
                sizes="(max-width: 1024px) 100vw, 40vw"
              />
            </div>
          </section>

          <section className="lg:col-span-7 space-y-4">
            <div className="space-y-1 pb-3 border-b border-[rgba(237,232,224,0.06)]">
              <div className="flex items-center gap-2 min-w-0">
                <h1 className="font-sans font-black text-[20px] sm:text-[22px] lg:text-[26px] text-[#eae1da] leading-tight tracking-tight min-w-0">
                  {product.nameJa}
                </h1>
                <WishlistButton
                  productId={product.productId}
                  gradingCompany={wishlistGrade.gradingCompany}
                  gradingScore={wishlistGrade.gradingScore}
                  trackedPrice={
                    lowestPrice != null && lowestPrice > 0 ? lowestPrice : null
                  }
                  initialIsFavored={wishlistIsFavored}
                  currentUserId={currentUserId}
                  className="shrink-0"
                />
              </div>
              {(product.nameZh?.trim() || product.rarity) && (
                <div className="flex items-center gap-2 flex-wrap">
                  {product.nameZh?.trim() ? (
                    <span className="font-sans text-[13px] text-[#d4c4b7]">
                      {product.nameZh.trim()}
                    </span>
                  ) : null}
                  {product.rarity ? (
                    <RarityBadge rarity={product.rarity} />
                  ) : null}
                </div>
              )}
              <div className="flex items-center gap-2 font-mono text-[11px] text-[#d4c4b7]">
                <span>{product.setCode}</span>
                {product.cardNumber ? (
                  <>
                    <span className="text-[#50453b]">|</span>
                    <span>{product.cardNumber}</span>
                  </>
                ) : null}
              </div>
            </div>

            <div
              id="live-order-book-panel"
              className="relative border-y border-white/[0.08] py-3 -mx-4 px-4 lg:mx-0 lg:px-0 scroll-mt-20"
            >
              {isListingsRefreshing ? (
                <div className="absolute inset-0 z-10 bg-[#17130f]/35 backdrop-blur-[1px] flex items-start justify-center pt-12 pointer-events-none">
                  <div className="w-6 h-6 rounded-full border-2 border-brand border-t-transparent animate-spin" />
                </div>
              ) : null}
              <div
                className={`space-y-2 transition-opacity duration-200 ${
                  isListingsRefreshing ? "opacity-60" : "opacity-100"
                }`}
              >
                <div className="flex items-center justify-between gap-2 min-w-0">
                  <h3 className={PRODUCT_DETAIL_SECTION_TITLE_CLASS}>
                    現貨掛單
                    <span className="text-[#8A8680] font-normal text-[13px]">
                      （{listingsMeta.total}）
                    </span>
                  </h3>
                  {showStandaloneBestPrice ? (
                    <p className="font-mono text-[12px] text-brand font-bold shrink-0">
                      最平 HK$ {globalBestAskPrice!.toLocaleString("en-HK")}
                    </p>
                  ) : null}
                </div>

                <div className="space-y-2 select-none">
                  <div
                    className="flex h-9 items-stretch overflow-hidden rounded-lg border border-white/8 bg-[#1A1612] font-sans text-[11px] text-[#eae1da]"
                  >
                    <Sheet
                      open={gradeFilterSheetOpen}
                      onOpenChange={setGradeFilterSheetOpen}
                    >
                      <SheetTrigger
                        className="lg:hidden flex min-w-0 flex-1 items-center border-r border-white/8 px-3 text-left text-[#eae1da] transition-colors hover:bg-[#2c2722] focus:outline-none"
                      >
                        <span className="truncate">
                          篩選 · {selectedGradeLabel}
                        </span>
                      </SheetTrigger>
                      <SheetContent
                        side="bottom"
                        className="bg-[#1A1612] border-white/10"
                      >
                        <SheetHeader>
                          <SheetTitle className="text-[#eae1da]">
                            規格篩選
                          </SheetTitle>
                        </SheetHeader>
                        <div className="flex flex-wrap gap-2 pt-2 pb-4">
                          {visibleGradeFilterOptions.map(renderGradeFilterChip)}
                        </div>
                      </SheetContent>
                    </Sheet>

                    <div
                      className="hidden lg:flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto border-r border-white/8 px-2 scrollbar-none"
                    >
                      {visibleGradeFilterOptions.map(renderGradeFilterChip)}
                    </div>

                    {!isSealedProduct ? (
                      <div
                        className="flex shrink-0 items-center gap-2 border-r border-white/8 px-3"
                      >
                        <label
                          htmlFor="graded-only-switch"
                          className="text-[10px] font-medium text-[#8A8680] cursor-pointer whitespace-nowrap"
                        >
                          已鑑定
                        </label>
                        <Switch
                          id="graded-only-switch"
                          checked={onlyGraded}
                          onCheckedChange={handleOnlyGradedChange}
                          className="scale-90 data-[state=checked]:bg-brand"
                        />
                      </div>
                    ) : null}

                    <div className="min-w-0 flex-1 lg:w-[8.5rem] lg:flex-none">
                      <Select
                        value={subSortKey}
                        onValueChange={(value) =>
                          setSubSortKey(value as SubSortKey)
                        }
                      >
                        <SelectTrigger
                          className="h-9 w-full min-w-0 rounded-none border-0 bg-transparent px-3 text-[11px] text-[#eae1da] shadow-none hover:bg-[#2c2722] transition-colors focus-visible:ring-0"
                        >
                          <span className="truncate">
                            {subSortKey === "price_asc" && "最平售價優先"}
                            {subSortKey === "grade_desc" && "鑑定等級最高"}
                            {subSortKey === "rating_desc" && "賣家評級最高"}
                          </span>
                        </SelectTrigger>
                        <SelectContent className="bg-[#26211C] border border-white/10 rounded-lg text-[#eae1da] font-sans text-[12px] shadow-2xl">
                          <SelectItem
                            value="price_asc"
                            className="focus:bg-[#322a24] focus:text-brand cursor-pointer transition-colors"
                          >
                            最平售價優先
                          </SelectItem>
                          <SelectItem
                            value="grade_desc"
                            className="focus:bg-[#322a24] focus:text-brand cursor-pointer transition-colors"
                          >
                            鑑定等級最高
                          </SelectItem>
                          <SelectItem
                            value="rating_desc"
                            className="focus:bg-[#322a24] focus:text-brand cursor-pointer transition-colors"
                          >
                            賣家評級最高
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>

                <div className="space-y-1">
                  {isListingsLoading ? (
                    <div className="py-6 text-center text-text-disabled font-sans text-[13px]">
                      載入掛單中…
                    </div>
                  ) : listingsError ? (
                    <div className="py-6 text-center text-text-disabled font-sans text-[13px]">
                      {listingsError}
                    </div>
                  ) : orderBookRows.length === 0 ? (
                    <div className="py-6 text-center text-text-disabled font-sans text-[13px]">
                      沒有符合當前快篩條件的賣盤掛單
                    </div>
                  ) : (
                    orderBookRows.map((row, idx) => {
                      const globalIdx = (orderPage - 1) * ordersPerPage + idx;
                      const isOwnListing =
                        currentUserId != null &&
                        row.order.sellerId === currentUserId;

                      return (
                        <AskOrderBookRow
                          key={row.listingId}
                          order={row.order}
                          idx={globalIdx}
                          productId={product.productId}
                          isOwnListing={isOwnListing}
                          onOpenGate={(o) => {
                            if (
                              currentUserId != null &&
                              o.sellerId === currentUserId
                            ) {
                              return;
                            }
                            openExecutionSlideOver(
                              buildOrderBookExecutionPayload(
                                product,
                                row.listingId,
                                o,
                              ),
                            );
                          }}
                          grade={row.order.customGrade}
                        />
                      );
                    })
                  )}
                </div>

                <Pagination
                  currentPage={listingsMeta.page}
                  totalPages={listingsMeta.totalPages}
                  onPageChange={setOrderPage}
                  itemLabel="筆掛單"
                  totalItems={listingsMeta.total}
                  itemsPerPage={ordersPerPage}
                  enableScroll={true}
                  scrollToViewId="live-order-book-panel"
                  className="mt-1 pb-0.5"
                />
              </div>
            </div>



            {showCombinedMarketEmpty ? (
              <ProductMarketDataEmptyPanel
                title="市場參考數據"
                message="參考均價與走勢將於有成交後顯示。"
                compact
              />
            ) : isMarketPriceLoading ? (
              <MarketIndexSkeleton />
            ) : marketPriceError ? (
              <ProductMarketDataEmptyPanel
                title={marketIndexTitle}
                message={marketPriceError}
                compact
              />
            ) : (
              <div
                className={`relative ${PRODUCT_DETAIL_PANEL_CLASS} p-4 space-y-3 transition-opacity duration-200 ${
                  isMarketPriceRefreshing ? "opacity-60" : "opacity-100"
                }`}
              >
                <p className="font-sans text-[11px] text-text-secondary leading-snug">
                  {marketIndexTitle}
                </p>
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <p className="font-mono font-black text-[22px] sm:text-[24px] text-[#eae1da] leading-none tracking-tight">
                    {hasMarketAvg
                      ? `HK$ ${marketPrice!.toLocaleString("en-HK")}`
                      : "—"}
                  </p>
                  {marketTrend30d != null ? (
                    <span
                      className={`inline-flex items-center gap-1 font-mono text-[12px] font-bold shrink-0 ${
                        marketTrend30d > 0
                          ? "text-[#10b981]"
                          : marketTrend30d < 0
                            ? "text-[#ef4444]"
                            : "text-[#8A8680]"
                      }`}
                    >
                      {marketTrend30d > 0 ? (
                        <IoTrendingUp className="size-3.5 shrink-0" aria-hidden />
                      ) : marketTrend30d < 0 ? (
                        <IoTrendingDown className="size-3.5 shrink-0" aria-hidden />
                      ) : null}
                      {marketTrend30d > 0 ? "+" : ""}
                      {marketTrend30d.toFixed(1)}%
                      <span className="font-sans font-medium text-[10px] opacity-80">
                        30日
                      </span>
                    </span>
                  ) : null}
                </div>
                {!hasMarketAvg ? (
                  <p className="font-sans text-[12px] text-text-disabled">
                    此規格暫無參考均價
                  </p>
                ) : null}
                {availableMarketGrades.length > 1 ? (
                  <div className="space-y-2 border-t border-white/[0.06] pt-3">
                    <span className="font-mono text-[10px] text-[#8A8680]">
                      參考規格
                    </span>
                    <div className="flex flex-wrap gap-1.5 sm:gap-2">
                      {availableMarketGrades.map((gradeOption) =>
                        renderMarketGradeChip(gradeOption),
                      )}
                    </div>
                  </div>
                ) : null}
              </div>
            )}

            {!showCombinedMarketEmpty ? (
              isMarketPriceLoading ? (
                <MarketChartSkeleton />
              ) : marketPriceError ? (
                <ProductMarketDataEmptyPanel
                  title={chartTitle}
                  message="無法載入走勢圖"
                />
              ) : hasChartData ? (
                <ProductPriceChart
                  chartPoints={chartPoints}
                  isGuest={isGuest}
                  productPath={productPath}
                />
              ) : (
                <ProductMarketDataEmptyPanel
                  title={chartTitle}
                  message="此規格暫無走勢圖資料"
                  compact
                />
              )
            ) : null}

            <div
              className={`relative min-h-[8rem] overflow-hidden ${PRODUCT_DETAIL_PANEL_CLASS} p-3 space-y-2`}
            >
              {isGuest && (
                <div className="absolute min-h-[8rem] inset-0 bg-[#17130f]/60 backdrop-blur-md z-30 flex flex-col items-center justify-center p-4 text-center select-none animate-fadeIn">
                  <p className="font-sans font-medium text-[12px] text-[#eae1da] mb-2">
                    登入解鎖全港歷史交割真理數據
                  </p>
                  <Link
                    href={`/auth?redirect=${encodeURIComponent(productPath)}`}
                    className="inline-flex items-center justify-center h-8 px-4 bg-brand text-[#1A1612] font-sans font-bold text-[12px] rounded-lg hover:bg-brand-hover transition-all active:scale-[0.97] cursor-pointer"
                  >
                    登入 / 註冊
                  </Link>
                  <Link
                    href={`/auth?redirect=${encodeURIComponent(productPath)}`}
                    className="font-sans text-[11px] text-brand underline mt-2 block cursor-pointer"
                  >
                    已有帳號？立即登入
                  </Link>
                </div>
              )}
              <h3 className={PRODUCT_DETAIL_SECTION_TITLE_CLASS}>
                最近全網已成交歷史紀錄
              </h3>
              <div className="space-y-2">
                {isGuest ? null : isTradeHistoryLoading ? (
                  <div className="py-6 text-center text-text-disabled font-sans text-[13px]">
                    載入成交紀錄中…
                  </div>
                ) : tradeHistoryError ? (
                  <div className="py-6 text-center text-text-disabled font-sans text-[13px]">
                    {tradeHistoryError}
                  </div>
                ) : tradeHistory.length === 0 ? (
                  <div className="py-6 text-center text-text-disabled font-sans text-[13px]">
                    暫無成交紀錄
                  </div>
                ) : (
                  tradeHistory.map((item) => {
                    const grade = formatListingGrade(
                      item.gradingCompany,
                      item.gradingScore,
                    );

                    return (
                    <div
                      key={item.orderId}
                      className="flex items-center justify-between font-mono text-[12px] p-2.5 bg-[#17130f] rounded-lg border border-white/[0.04]"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <RelativeDateTime
                          value={item.createdAt}
                          className="text-[#8A8680] shrink-0"
                        />
                        <span className="text-[#50453b] shrink-0">|</span>
                        <GradeBadge
                          authority={grade.authority}
                          score={grade.score}
                          size="sm"
                        />
                      </div>
                      <span className="font-bold text-[#22c55e] shrink-0">
                        HK$ {item.price.toLocaleString("en-HK")}
                      </span>
                    </div>
                    );
                  })
                )}
              </div>

              {!isGuest && tradeHistoryMeta.total > 0 ? (
                <Pagination
                  currentPage={tradeHistoryMeta.page}
                  totalPages={tradeHistoryMeta.totalPages}
                  onPageChange={setHistoryPage}
                  itemLabel="筆成交紀錄"
                  totalItems={tradeHistoryMeta.total}
                  itemsPerPage={historyPerPage}
                  enableScroll={false}
                  className="mt-3 pt-1"
                />
              ) : null}
            </div>

            <div className={`${PRODUCT_DETAIL_PANEL_CLASS} overflow-hidden`}>
              <div className="px-3 py-2.5 border-b border-[rgba(237,232,224,0.08)]">
                <h3 className={PRODUCT_DETAIL_SECTION_TITLE_CLASS}>
                  官方標準資產屬性
                </h3>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 font-sans text-[12px]">
                {[
                  { label: "系列名稱", val: product.setCode },
                  { label: "日版原名", val: product.nameJa },
                  {
                    label: "卡牌屬性",
                    val: formatElementTypeZh(product.elementType),
                  },
                  {
                    label: "進化階段",
                    val: formatSpecValue(product.pokemonStage),
                  },
                ].map((row, idx) => (
                  <div
                    key={row.label}
                    className={`flex items-center justify-between p-3 ${idx % 2 === 0 ? "bg-[#2c2722]" : "bg-[#26211C]"} border-b border-white/[0.04]`}
                  >
                    <span className="text-[#d4c4b7]">{row.label}</span>
                    <span className="font-semibold text-[#eae1da] text-right truncate max-w-[180px]">
                      {row.val}
                    </span>
                  </div>
                ))}
                <div className="flex items-center justify-between p-3 bg-[#26211C] border-b border-white/[0.04] sm:col-span-2">
                  <span className="text-[#d4c4b7]">稀有度</span>
                  <RarityBadge rarity={product.rarity} />
                </div>
              </div>
            </div>
            <TrustBanner />
          </section>
        </div>
      </main>
    </div>
  );
}
