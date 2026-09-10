"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { searchMarketplaceSellerListings } from "@/app/actions/marketplace";
import { parseGradeFilters } from "@/app/lib/marketplace/searchParsers";
import type {
  MarketplacePaginationMeta,
  MarketplaceSellerListingRow,
} from "@/app/lib/marketplace/types";
import type { ReviewPersona } from "@/app/lib/reviews/types";
import type { SortKey } from "@/app/store/useMarketStore";
import { MARKETPLACE_STOREFRONT_PAGE_SIZE } from "@/lib/marketplace/constants";

const QUERY_DEBOUNCE_MS = 350;

const EMPTY_META: MarketplacePaginationMeta = {
  total: 0,
  page: 1,
  pageSize: MARKETPLACE_STOREFRONT_PAGE_SIZE,
  totalPages: 0,
  rangeStart: 0,
  rangeEnd: 0,
};

export type MarketplaceSellerSearchFilters = {
  sellerId: string;
  sellerPersona?: ReviewPersona;
  query: string;
  rarities: string[];
  grades: string[];
  priceMin: number;
  priceMax: number;
  sortKey: SortKey;
  page?: number;
  pageSize?: number;
};

export type MarketplaceSellerSearchInitialData = {
  listings: MarketplaceSellerListingRow[];
  meta: MarketplacePaginationMeta;
  priceBounds: { minPrice: number; maxPrice: number };
};

type UseMarketplaceSellerSearchOptions = {
  initialData?: MarketplaceSellerSearchInitialData;
  absolutePriceBounds?: { minPrice: number; maxPrice: number } | null;
};

type UseMarketplaceSellerSearchResult = {
  listings: MarketplaceSellerListingRow[];
  meta: MarketplacePaginationMeta;
  isLoading: boolean;
  isRefreshing: boolean;
  error: string | null;
  priceBounds: { minPrice: number; maxPrice: number } | null;
  refetch: () => void;
};

function filtersKey(filters: MarketplaceSellerSearchFilters): string {
  return [
    filters.sellerId,
    filters.sellerPersona ?? "",
    filters.query,
    filters.sortKey,
    filters.rarities.join(","),
    filters.grades.join(","),
    filters.priceMin,
    filters.priceMax,
    filters.page ?? 1,
    filters.pageSize ?? MARKETPLACE_STOREFRONT_PAGE_SIZE,
  ].join("|");
}

function resolveSearchPriceFilters(
  filters: MarketplaceSellerSearchFilters,
  absolutePriceBounds?: { minPrice: number; maxPrice: number } | null,
): { priceMin?: number; priceMax?: number } {
  if (!absolutePriceBounds) {
    return {
      priceMin: filters.priceMin,
      priceMax: filters.priceMax,
    };
  }

  const priceMin =
    filters.priceMin > absolutePriceBounds.minPrice
      ? filters.priceMin
      : undefined;
  const priceMax =
    filters.priceMax < absolutePriceBounds.maxPrice
      ? filters.priceMax
      : undefined;

  return { priceMin, priceMax };
}

export function useMarketplaceSellerSearch(
  filters: MarketplaceSellerSearchFilters,
  options: UseMarketplaceSellerSearchOptions = {},
): UseMarketplaceSellerSearchResult {
  const { initialData, absolutePriceBounds } = options;
  const hasInitialListings = initialData != null;
  const [listings, setListings] = useState<MarketplaceSellerListingRow[]>(
    initialData?.listings ?? [],
  );
  const [meta, setMeta] = useState<MarketplacePaginationMeta>(
    initialData?.meta ?? EMPTY_META,
  );
  const [isFetching, setIsFetching] = useState(!hasInitialListings);
  const [error, setError] = useState<string | null>(null);
  const [priceBounds, setPriceBounds] = useState<{
    minPrice: number;
    maxPrice: number;
  } | null>(initialData?.priceBounds ?? null);

  const requestIdRef = useRef(0);
  const filtersRef = useRef(filters);
  const skipNextSearchRef = useRef(hasInitialListings);
  const [debouncedQuery, setDebouncedQuery] = useState(filters.query);

  filtersRef.current = filters;

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedQuery(filters.query);
    }, QUERY_DEBOUNCE_MS);

    return () => window.clearTimeout(timer);
  }, [filters.query]);

  const searchKey = filtersKey({ ...filters, query: debouncedQuery });

  const runSearch = useCallback(
    async (requestId: number, activeFilters: MarketplaceSellerSearchFilters) => {
      const { priceMin, priceMax } = resolveSearchPriceFilters(
        activeFilters,
        absolutePriceBounds,
      );

      try {
        const result = await searchMarketplaceSellerListings({
          sellerId: activeFilters.sellerId,
          sellerPersona: activeFilters.sellerPersona,
          query: activeFilters.query,
          rarities: activeFilters.rarities,
          gradeFilters: parseGradeFilters(activeFilters.grades),
          priceMin,
          priceMax,
          sortKey: activeFilters.sortKey,
          page: activeFilters.page ?? 1,
          pageSize:
            activeFilters.pageSize ?? MARKETPLACE_STOREFRONT_PAGE_SIZE,
        });

        if (requestId !== requestIdRef.current) return;

        if (!result.success) {
          setListings([]);
          setMeta(EMPTY_META);
          setError(result.error);
          return;
        }

        setListings(result.data.listings);
        setMeta(result.data.meta);
        setPriceBounds(result.data.priceBounds);
        setError(null);
      } catch {
        if (requestId !== requestIdRef.current) return;
        setListings([]);
        setMeta(EMPTY_META);
        setError("無法載入商戶櫥窗");
      } finally {
        if (requestId === requestIdRef.current) {
          setIsFetching(false);
        }
      }
    },
    [absolutePriceBounds],
  );

  useEffect(() => {
    if (!filtersRef.current.sellerId) {
      return;
    }

    if (skipNextSearchRef.current) {
      skipNextSearchRef.current = false;
      return;
    }

    const requestId = ++requestIdRef.current;
    setIsFetching(true);

    void runSearch(requestId, {
      ...filtersRef.current,
      query: debouncedQuery,
    });
  }, [searchKey, debouncedQuery, runSearch]);

  const refetch = useCallback(() => {
    const requestId = ++requestIdRef.current;
    setIsFetching(true);
    void runSearch(requestId, filtersRef.current);
  }, [runSearch]);

  const isLoading = isFetching && listings.length === 0;
  const isRefreshing = isFetching && listings.length > 0;

  return {
    listings,
    meta,
    isLoading,
    isRefreshing,
    error,
    priceBounds,
    refetch,
  };
}
