"use client";

import { useEffect, useState } from "react";
import { Search, X } from "lucide-react";
import {
  InventoryStatusTabs,
  inventoryEmptyMessageForStatus,
} from "@/app/components/inventory/InventoryStatusTabs";
import { InventoryAccordion } from "@/app/components/merchant/InventoryAccordion";
import { Pagination } from "@/app/components/ui/Pagination";
import {
  useInventory,
  type InventoryInitialData,
} from "@/app/lib/hooks/useInventory";
import {
  DEFAULT_INVENTORY_STATUS_FILTER,
  type InventoryStatusFilter,
} from "@/app/lib/inventory/types";
import { INVENTORY_DEFAULT_PAGE_SIZE } from "@/lib/listings/constants";

type ProfileInventoryClientProps = {
  initialData: InventoryInitialData;
  bootstrapError?: string;
  sellerPersona: "merchant" | "member";
  inventoryContext: "merchant" | "member";
  searchInputId: string;
  showProductAnalytics?: boolean;
};

export function ProfileInventoryClient({
  initialData,
  bootstrapError,
  sellerPersona,
  inventoryContext,
  searchInputId,
  showProductAnalytics = false,
}: ProfileInventoryClientProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] =
    useState<InventoryStatusFilter>(DEFAULT_INVENTORY_STATUS_FILTER);

  const {
    groups: skuGroups,
    totalGroups,
    page: currentSkuPage,
    pageSize: skusPerPage,
    totalPages,
    summary,
    isLoading,
    isSummaryLoading,
    isRefreshing,
    setPage: setCurrentSkuPage,
    refetch,
  } = useInventory({
    query: searchQuery,
    pageSize: INVENTORY_DEFAULT_PAGE_SIZE,
    initialData,
    sellerPersona,
    statusFilter,
  });

  useEffect(() => {
    const handleRefresh = () => {
      refetch();
    };

    window.addEventListener("inventory-should-refresh", handleRefresh);
    return () => {
      window.removeEventListener("inventory-should-refresh", handleRefresh);
    };
  }, [refetch]);

  const statusCounts: Record<InventoryStatusFilter, number> = {
    active: summary?.activeCount ?? 0,
    inactive: summary?.inactiveCount ?? 0,
    sold: summary?.soldCount ?? 0,
  };

  return (
    <div
      className={`animate-fadeIn${isRefreshing ? " opacity-80 pointer-events-none" : ""}`}
    >
      {bootstrapError ? (
        <div className="mb-3 px-3 py-2 bg-[rgba(239,68,68,0.06)] border border-warning/25 rounded-lg">
          <p className="font-sans text-[12px] text-warning">
            無法載入庫存：{bootstrapError}
          </p>
        </div>
      ) : null}

      <section
        id="listings-heading"
        aria-label="掛單列表"
        className="rounded-xl overflow-hidden bg-bg-card border border-[rgba(237,232,224,0.08)]"
      >
        <InventoryStatusTabs
          activeTab={statusFilter}
          counts={statusCounts}
          isLoading={isSummaryLoading}
          onChange={setStatusFilter}
        />

        <div className="px-3 py-2.5 sm:px-4 border-b border-[rgba(237,232,224,0.06)]">
          <div className="relative">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-disabled pointer-events-none"
              aria-hidden
            />
            <input
              id={searchInputId}
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="搜尋卡牌名稱、卡號 (如 sv2a-182)…"
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

        <div
          className={`px-2 sm:px-3 py-2.5 space-y-2.5${
            skuGroups.length === 0 ? " min-h-[12rem]" : ""
          }`}
        >
          {isLoading && skuGroups.length === 0 ? (
            <p className="font-sans text-[13px] text-text-disabled py-12 text-center">
              載入中…
            </p>
          ) : skuGroups.length === 0 ? (
            <p className="font-sans text-[13px] text-text-disabled py-12 text-center">
              {inventoryEmptyMessageForStatus(statusFilter)}
            </p>
          ) : (
            <InventoryAccordion
              skuGroups={skuGroups}
              analytics={showProductAnalytics}
              inventoryContext={inventoryContext}
            />
          )}

          {totalPages > 1 ? (
            <div className="pt-1">
              <Pagination
                currentPage={currentSkuPage}
                totalPages={totalPages}
                onPageChange={(page) => setCurrentSkuPage(page)}
                itemLabel="款卡牌商品"
                totalItems={totalGroups}
                itemsPerPage={skusPerPage}
                enableScroll={true}
                scrollToViewId="listings-heading"
                scrollBlock="end"
              />
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}
