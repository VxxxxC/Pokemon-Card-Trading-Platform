"use client";

import { useEffect, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";
import { DASHBOARD_SECTION_TITLE_CLASS } from "@/app/profile/dashboard-ui";
import { Pagination } from "@/app/components/ui/Pagination";
import { MerchantOrderRow } from "@/app/components/merchant/MerchantOrderRow";
import { TradingFilterResetButton } from "@/app/components/trading/TradingFilterResetButton";
import { TradingSegmentedFilter } from "@/app/components/trading/TradingSegmentedFilter";
import {
  hasActiveMerchantTradingFilters,
  useTradingFiltersStore,
} from "@/app/store/useTradingFiltersStore";
import {
  useMerchantTrading,
  type MerchantTradingInitialData,
} from "@/app/lib/hooks/useMerchantTrading";
import { mapMerchantTradingOrderToSaleOrder } from "@/app/lib/merchant-order/map-sale-order";
import {
  MERCHANT_STATUS_OPTIONS,
  TAB_STATUS_FROM_PARAM,
  type TabStatusFilter,
} from "@/lib/merchant-order/constants";

type MerchantTradingClientProps = {
  initialData: MerchantTradingInitialData;
  initialTabStatus: TabStatusFilter;
  bootstrapError?: string;
};

export function MerchantTradingClient({
  initialData,
  bootstrapError,
}: MerchantTradingClientProps) {
  const searchParams = useSearchParams();
  const tabStatus = useTradingFiltersStore((state) => state.merchant.tabStatus);
  const searchQuery = useTradingFiltersStore((state) => state.merchant.searchQuery);
  const subPaymentChecked = useTradingFiltersStore(
    (state) => state.merchant.includePaymentPending,
  );
  const subGradingChecked = useTradingFiltersStore(
    (state) => state.merchant.includeAuthInProgress,
  );
  const setTabStatus = useTradingFiltersStore((state) => state.setMerchantTabStatus);
  const setSearchQuery = useTradingFiltersStore((state) => state.setMerchantSearchQuery);
  const setSubPaymentChecked = useTradingFiltersStore(
    (state) => state.setMerchantIncludePaymentPending,
  );
  const setSubGradingChecked = useTradingFiltersStore(
    (state) => state.setMerchantIncludeAuthInProgress,
  );
  const resetMerchantFilters = useTradingFiltersStore(
    (state) => state.resetMerchantFilters,
  );
  const hasActiveFilters = useTradingFiltersStore((state) =>
    hasActiveMerchantTradingFilters(state.merchant),
  );

  const {
    orders,
    paginationMeta,
    filterCounts,
    isLoading,
    isRefreshing,
    error: fetchError,
    setPage,
  } = useMerchantTrading({
    tabStatus,
    searchQuery,
    includePaymentPending: subPaymentChecked,
    includeAuthInProgress: subGradingChecked,
    initialData,
  });

  useEffect(() => {
    const queryFilter = searchParams.get("filter");
    if (queryFilter && TAB_STATUS_FROM_PARAM[queryFilter]) {
      const nextStatus = TAB_STATUS_FROM_PARAM[queryFilter];
      queueMicrotask(() => setTabStatus(nextStatus));
    }
  }, [searchParams, setTabStatus]);

  const saleOrders = useMemo(
    () => orders.map(mapMerchantTradingOrderToSaleOrder),
    [orders],
  );

  const needsAction = filterCounts.needsAction;
  const displayError = bootstrapError ?? fetchError;

  const statusSegmentOptions = MERCHANT_STATUS_OPTIONS.map((option) => ({
    value: option.value,
    label: option.label,
    count: filterCounts.status[option.value],
  }));

  return (
    <div
      className={`animate-fadeIn${isRefreshing ? " opacity-80 pointer-events-none" : ""}`}
    >
      {needsAction > 0 ? (
        <div className="mb-3 flex items-start gap-2 px-3 py-2 bg-[rgba(239,68,68,0.06)] border border-warning/25 rounded-lg">
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#ef4444"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="shrink-0 mt-0.5"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <p className="font-sans text-[12px] text-text-primary leading-snug">
            <span className="font-semibold text-warning">
              {needsAction} 件訂單
            </span>{" "}
            需要您的處理：確認訂單或安排發貨。
          </p>
        </div>
      ) : null}

      {displayError ? (
        <div className="mb-3 px-3 py-2 bg-[rgba(239,68,68,0.06)] border border-warning/25 rounded-lg">
          <p className="font-sans text-[12px] text-warning">
            無法載入訂單：{displayError}
          </p>
        </div>
      ) : null}

      <section
        id="orders-list"
        aria-labelledby="merchant-trading-heading"
        className="rounded-xl overflow-hidden bg-bg-card border border-[rgba(237,232,224,0.08)]"
      >
        <div className="px-3 py-2.5 sm:px-4 border-b border-[rgba(237,232,224,0.06)]">
          <div className="relative">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-disabled pointer-events-none"
              aria-hidden
            />
            <input
              id="merchant-order-search"
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="輸入卡牌名稱、卡號、交易對手姓名或訂單ID…"
              className="w-full h-9 pl-9 pr-9 bg-bg-page/50 border border-[rgba(237,232,224,0.08)] rounded-lg font-sans text-[13px] text-text-primary placeholder:text-text-disabled focus:outline-none focus:border-brand/30 transition-colors"
            />
            {searchQuery ? (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-text-disabled hover:text-text-primary transition-colors focus:outline-none"
                aria-label="清除搜尋"
              >
                <X className="h-3.5 w-3.5" aria-hidden />
              </button>
            ) : null}
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 px-3 py-2 sm:px-4 border-b border-[rgba(237,232,224,0.06)]">
          <h2
            id="merchant-trading-heading"
            className={`${DASHBOARD_SECTION_TITLE_CLASS} min-w-0 truncate`}
          >
            交易管理
          </h2>
        </div>

        <div className="px-3 py-2 sm:px-4 border-b border-[rgba(237,232,224,0.06)] space-y-2">
          <div className="space-y-1">
            <div className="flex items-center justify-between gap-2">
              <p
                className="font-mono text-[9px] text-text-disabled tracking-wide"
                id="merchant-trading-status-filter-label"
              >
                訂單狀態
              </p>
              <TradingFilterResetButton
                hasActiveFilters={hasActiveFilters}
                onReset={resetMerchantFilters}
              />
            </div>
            <TradingSegmentedFilter
              options={statusSegmentOptions}
              value={tabStatus}
              onChange={setTabStatus}
              columns={4}
              pendingValue="pending"
              ariaLabelledBy="merchant-trading-status-filter-label"
            />
          </div>

          {tabStatus === "pending" ? (
            <div className="flex flex-wrap items-center gap-3 pt-0.5">
              <span className="font-mono text-[9px] text-text-disabled tracking-wide">
                進階子篩選
              </span>
              <label className="flex items-center gap-2 font-sans text-[12px] text-text-primary cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={subPaymentChecked}
                  onChange={(e) => setSubPaymentChecked(e.target.checked)}
                  className="w-3.5 h-3.5 rounded border-white/10 bg-bg-card text-brand focus:ring-0 focus:ring-offset-0 cursor-pointer"
                />
                待付款
                {filterCounts.pendingSub.payment > 0
                  ? ` (${filterCounts.pendingSub.payment})`
                  : ""}
              </label>
              <label className="flex items-center gap-2 font-sans text-[12px] text-text-primary cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={subGradingChecked}
                  onChange={(e) => setSubGradingChecked(e.target.checked)}
                  className="w-3.5 h-3.5 rounded border-white/10 bg-bg-card text-brand focus:ring-0 focus:ring-offset-0 cursor-pointer"
                />
                鑑定中
                {filterCounts.pendingSub.authInProgress > 0
                  ? ` (${filterCounts.pendingSub.authInProgress})`
                  : ""}
              </label>
            </div>
          ) : null}
        </div>

        <div className="px-2 sm:px-3 py-2.5 min-h-[12rem] space-y-2.5">
          {isLoading && saleOrders.length === 0 ? (
            <div className="py-12 flex justify-center">
              <div className="w-7 h-7 rounded-full border-2 border-brand border-t-transparent animate-spin" />
            </div>
          ) : saleOrders.length === 0 ? (
            <p className="font-sans text-[13px] text-text-disabled py-12 text-center">
              沒有符合當前篩選與關鍵字的交易訂單記錄。
            </p>
          ) : (
            saleOrders.map((order) => (
              <MerchantOrderRow key={order.id} order={order} />
            ))
          )}
        </div>

        {paginationMeta.total > 0 ? (
          <div className="px-3 pb-2 sm:px-4">
            <Pagination
              currentPage={paginationMeta.page}
              totalPages={paginationMeta.totalPages}
              onPageChange={(page) => setPage(page)}
              itemLabel="筆訂單記錄"
              totalItems={paginationMeta.total}
              itemsPerPage={paginationMeta.pageSize}
              enableScroll={true}
              scrollBlock="start"
              scrollToViewId="orders-list"
            />
          </div>
        ) : null}
      </section>
    </div>
  );
}
