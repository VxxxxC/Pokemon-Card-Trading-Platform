"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  getCollectionEntries,
  getCollectionPageBootstrap,
  removeFromCollection,
  updateCollectionGrade,
} from "@/app/actions/collection";
import type {
  CollectionEntriesPage,
  CollectionEntry,
  CollectionListFilter,
  CollectionPageBootstrap,
  CollectionPortfolioSummary,
} from "@/app/lib/collection/types";
import {
  logCollectionClientReady,
  markCollectionClientMount,
} from "@/app/lib/collection/perf-log-client";
import { COLLECTION_DEFAULT_PAGE_SIZE } from "@/lib/collection/constants";
import type { GradingOption } from "@/lib/grading/options";
import { wishlistGradeFromGradingOption } from "@/lib/wishlist/grading";

const SEARCH_DEBOUNCE_MS = 350;

export const COLLECTION_FILTER_LABELS: Record<string, CollectionListFilter> = {
  全部: "all",
  已鑑定: "graded",
  裸卡: "raw",
  密封盒組: "sealed",
  已上架: "listed",
  已售出: "sold",
};

export type CollectionInitialData = Partial<CollectionPageBootstrap>;

type UseCollectionOptions = {
  filter?: CollectionListFilter;
  query?: string;
  page?: number;
  pageSize?: number;
  initialData?: CollectionInitialData;
};

type UseCollectionResult = {
  entries: CollectionEntry[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  summary: CollectionPortfolioSummary | null;
  isLoading: boolean;
  isSummaryLoading: boolean;
  isRefreshing: boolean;
  error: string | null;
  refetch: () => void;
  setPage: (page: number) => void;
  removeEntry: (entry: CollectionEntry) => Promise<boolean>;
  updateGrade: (
    entry: CollectionEntry,
    option: GradingOption,
  ) => Promise<boolean>;
};

function hasCollectionInitialBootstrap(
  data: CollectionInitialData | undefined,
): data is CollectionPageBootstrap {
  return Boolean(data?.summary && data?.page);
}

export function useCollection(options: UseCollectionOptions = {}): UseCollectionResult {
  const filter = options.filter ?? "all";
  const query = options.query ?? "";
  const pageSize = options.pageSize ?? COLLECTION_DEFAULT_PAGE_SIZE;
  const hasInitialBootstrap = hasCollectionInitialBootstrap(options.initialData);

  const [entries, setEntries] = useState<CollectionEntry[]>(
    options.initialData?.page?.entries ?? [],
  );
  const [total, setTotal] = useState(options.initialData?.page?.total ?? 0);
  const [totalPages, setTotalPages] = useState(
    options.initialData?.page?.totalPages ?? 0,
  );
  const [summary, setSummary] = useState<CollectionPortfolioSummary | null>(
    options.initialData?.summary ?? null,
  );
  const [isLoading, setIsLoading] = useState(!hasInitialBootstrap);
  const [isSummaryLoading, setIsSummaryLoading] = useState(!hasInitialBootstrap);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pageByListKey, setPageByListKey] = useState<Record<string, number>>({});
  const mountLoggedRef = useRef(false);
  const [initialListKey] = useState(() => `all::${pageSize}`);
  const didInitialBootstrapRef = useRef(hasInitialBootstrap);
  const consumedInitialEntriesRef = useRef(false);
  const initialPageRef = useRef(options.initialData?.page?.page ?? 1);

  const debouncedQueryRef = useRef(query);
  const [debouncedQuery, setDebouncedQuery] = useState(query);

  const listKey = `${filter}:${debouncedQuery}:${pageSize}`;
  const page = pageByListKey[listKey] ?? options.page ?? 1;
  const isInitialListKey = listKey === initialListKey;

  const setPage = useCallback(
    (nextPage: number) => {
      setPageByListKey((current) => ({ ...current, [listKey]: nextPage }));
    },
    [listKey],
  );

  useEffect(() => {
    debouncedQueryRef.current = query;
    const timer = window.setTimeout(() => {
      setDebouncedQuery(debouncedQueryRef.current);
    }, SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    if (mountLoggedRef.current) return;
    mountLoggedRef.current = true;
    markCollectionClientMount(hasInitialBootstrap);
    if (hasInitialBootstrap) {
      logCollectionClientReady("bootstrap");
    }
  }, [hasInitialBootstrap]);

  const applyPageResult = useCallback(
    (data: CollectionEntriesPage) => {
      setEntries(data.entries);
      setTotal(data.total);
      setTotalPages(data.totalPages);
      setPageByListKey((current) => {
        const existing = current[listKey] ?? 1;
        if (data.page === existing) {
          return current;
        }
        return { ...current, [listKey]: data.page };
      });
    },
    [listKey],
  );

  const refreshBootstrap = useCallback(async (): Promise<boolean> => {
    const result = await getCollectionPageBootstrap({
      page,
      pageSize,
      filter,
      query: debouncedQuery,
    });

    if (!result.success) {
      setError(result.error);
      toast.error(result.error);
      return false;
    }

    setSummary(result.data.summary);
    applyPageResult(result.data.page);
    setError(null);
    return true;
  }, [page, pageSize, filter, debouncedQuery, applyPageResult]);

  const refetch = useCallback(() => {
    void (async () => {
      setIsRefreshing(true);
      await refreshBootstrap();
      setIsRefreshing(false);
    })();
  }, [refreshBootstrap]);

  useEffect(() => {
    if (hasInitialBootstrap || didInitialBootstrapRef.current) {
      return;
    }

    let cancelled = false;

    (async () => {
      setIsSummaryLoading(true);
      setIsLoading(true);

      const result = await getCollectionPageBootstrap({
        page,
        pageSize,
        filter,
        query: debouncedQuery,
      });

      if (cancelled) return;

      didInitialBootstrapRef.current = true;

      if (!result.success) {
        setError(result.error);
        setSummary(null);
        setEntries([]);
        setTotal(0);
        setTotalPages(0);
      } else {
        setSummary(result.data.summary);
        applyPageResult(result.data.page);
        setError(null);
      }

      setIsSummaryLoading(false);
      setIsLoading(false);
      logCollectionClientReady("bootstrap");
    })();

    return () => {
      cancelled = true;
    };
  }, [
    hasInitialBootstrap,
    page,
    pageSize,
    filter,
    debouncedQuery,
    applyPageResult,
  ]);

  useEffect(() => {
    if (!didInitialBootstrapRef.current && !hasInitialBootstrap) {
      return;
    }

    if (
      hasInitialBootstrap &&
      !consumedInitialEntriesRef.current &&
      isInitialListKey &&
      page === initialPageRef.current
    ) {
      consumedInitialEntriesRef.current = true;
      return;
    }

    let cancelled = false;

    (async () => {
      setIsLoading(true);
      const result = await getCollectionEntries({
        page,
        pageSize,
        filter,
        query: debouncedQuery,
      });

      if (cancelled) return;

      if (!result.success) {
        setEntries([]);
        setTotal(0);
        setTotalPages(0);
        setError(result.error);
        setIsLoading(false);
        return;
      }

      applyPageResult(result.data);
      setError(null);
      setIsLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [
    page,
    pageSize,
    filter,
    debouncedQuery,
    hasInitialBootstrap,
    isInitialListKey,
    applyPageResult,
  ]);

  const removeEntry = useCallback(
    async (entry: CollectionEntry) => {
      const result = await removeFromCollection({
        collectionId: entry.collectionId,
      });

      if (!result.success) {
        setError(result.error);
        toast.error(result.error);
        return false;
      }

      setError(null);
      toast.success("已從資產庫移除");
      setIsRefreshing(true);
      const refreshed = await refreshBootstrap();
      setIsRefreshing(false);
      return refreshed;
    },
    [refreshBootstrap],
  );

  const updateGrade = useCallback(
    async (entry: CollectionEntry, option: GradingOption) => {
      const next = wishlistGradeFromGradingOption(option);
      if (
        next.gradingCompany === entry.gradingCompany &&
        next.gradingScore === entry.gradingScore
      ) {
        return true;
      }

      const result = await updateCollectionGrade({
        collectionId: entry.collectionId,
        nextGradingOptionId: option.id,
      });

      if (!result.success) {
        setError(result.error);
        toast.error(result.error);
        return false;
      }

      setError(null);
      setIsRefreshing(true);
      const refreshed = await refreshBootstrap();
      setIsRefreshing(false);
      return refreshed;
    },
    [refreshBootstrap],
  );

  return {
    entries,
    total,
    page,
    pageSize,
    totalPages,
    summary,
    isLoading,
    isSummaryLoading,
    isRefreshing,
    error,
    refetch,
    setPage,
    removeEntry,
    updateGrade,
  };
}
