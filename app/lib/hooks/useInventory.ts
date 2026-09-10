"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  getInventoryPageBootstrap,
  getUserInventoryGroups,
} from "@/app/actions/inventory";
import type {
  InventoryPageBootstrap,
  InventoryProductGroup,
  InventorySellerPersona,
  InventoryStatusFilter,
  InventorySummary,
} from "@/app/lib/inventory/types";
import { DEFAULT_INVENTORY_STATUS_FILTER } from "@/app/lib/inventory/types";
import {
  logInventoryClientReady,
  markInventoryClientMount,
} from "@/app/lib/inventory/perf-log-client";
import { INVENTORY_DEFAULT_PAGE_SIZE } from "@/lib/listings/constants";

const SEARCH_DEBOUNCE_MS = 350;

export type InventoryInitialData = Partial<InventoryPageBootstrap>;

type UseInventoryOptions = {
  query?: string;
  page?: number;
  pageSize?: number;
  initialData?: InventoryInitialData;
  sellerPersona?: InventorySellerPersona;
  statusFilter?: InventoryStatusFilter;
};

type UseInventoryResult = {
  groups: InventoryProductGroup[];
  totalGroups: number;
  page: number;
  pageSize: number;
  totalPages: number;
  summary: InventorySummary | null;
  isLoading: boolean;
  isSummaryLoading: boolean;
  isRefreshing: boolean;
  error: string | null;
  refetch: () => void;
  setPage: (page: number) => void;
};

function hasInventoryInitialBootstrap(
  data: InventoryInitialData | undefined,
): data is InventoryPageBootstrap {
  return Boolean(data?.summary && data?.page);
}

export function useInventory(options: UseInventoryOptions = {}): UseInventoryResult {
  const query = options.query ?? "";
  const pageSize = options.pageSize ?? INVENTORY_DEFAULT_PAGE_SIZE;
  const sellerPersona = options.sellerPersona;
  const statusFilter = options.statusFilter ?? DEFAULT_INVENTORY_STATUS_FILTER;
  const hasInitialBootstrap = hasInventoryInitialBootstrap(options.initialData);

  const [page, setPage] = useState(options.initialData?.page?.page ?? options.page ?? 1);
  const [groups, setGroups] = useState<InventoryProductGroup[]>(
    options.initialData?.page?.groups ?? [],
  );
  const [totalGroups, setTotalGroups] = useState(
    options.initialData?.page?.totalGroups ?? 0,
  );
  const [totalPages, setTotalPages] = useState(
    options.initialData?.page?.totalPages ?? 0,
  );
  const [summary, setSummary] = useState<InventorySummary | null>(
    options.initialData?.summary ?? null,
  );
  const [isLoading, setIsLoading] = useState(!hasInitialBootstrap);
  const [isSummaryLoading, setIsSummaryLoading] = useState(!hasInitialBootstrap);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mountLoggedRef = useRef(false);
  const didInitialBootstrapRef = useRef(hasInitialBootstrap);
  const consumedInitialGroupsRef = useRef(false);
  const [initialListKey] = useState(
    () => `:${pageSize}:${sellerPersona ?? ""}:${statusFilter}`,
  );
  const initialPageRef = useRef(options.initialData?.page?.page ?? 1);

  const debouncedQueryRef = useRef(query);
  const [debouncedQuery, setDebouncedQuery] = useState(query);
  const listKey = `${debouncedQuery}:${pageSize}:${sellerPersona ?? ""}:${statusFilter}`;
  const isInitialListKey = listKey === initialListKey;

  useEffect(() => {
    debouncedQueryRef.current = query;
    const timer = window.setTimeout(() => {
      setDebouncedQuery(debouncedQueryRef.current);
    }, SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    queueMicrotask(() => setPage(1));
  }, [debouncedQuery, pageSize, statusFilter]);

  useEffect(() => {
    if (mountLoggedRef.current) return;
    mountLoggedRef.current = true;
    markInventoryClientMount(hasInitialBootstrap);
    if (hasInitialBootstrap) {
      logInventoryClientReady("bootstrap");
    }
  }, [hasInitialBootstrap]);

  const refreshBootstrap = useCallback(async (): Promise<boolean> => {
    const result = await getInventoryPageBootstrap({
      page,
      pageSize,
      query: debouncedQuery,
      sellerPersona,
      statusFilter,
    });

    if (!result.success) {
      setError(result.error);
      toast.error(result.error);
      return false;
    }

    setSummary(result.data.summary);
    setGroups(result.data.page.groups);
    setTotalGroups(result.data.page.totalGroups);
    setTotalPages(result.data.page.totalPages);
    setPage(result.data.page.page);
    setError(null);
    return true;
  }, [page, pageSize, debouncedQuery, sellerPersona, statusFilter]);

  const refetch = useCallback(() => {
    void (async () => {
      setIsRefreshing(true);
      setIsSummaryLoading(true);
      await refreshBootstrap();
      setIsRefreshing(false);
      setIsSummaryLoading(false);
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

      const result = await getInventoryPageBootstrap({
        page,
        pageSize,
        query: debouncedQuery,
        sellerPersona,
        statusFilter,
      });

      if (cancelled) return;

      didInitialBootstrapRef.current = true;

      if (!result.success) {
        setError(result.error);
        setSummary(null);
        setGroups([]);
        setTotalGroups(0);
        setTotalPages(0);
      } else {
        setSummary(result.data.summary);
        setGroups(result.data.page.groups);
        setTotalGroups(result.data.page.totalGroups);
        setTotalPages(result.data.page.totalPages);
        setPage(result.data.page.page);
        setError(null);
      }

      setIsSummaryLoading(false);
      setIsLoading(false);
      logInventoryClientReady("bootstrap");
    })();

    return () => {
      cancelled = true;
    };
  }, [hasInitialBootstrap, page, pageSize, debouncedQuery, sellerPersona, statusFilter]);

  useEffect(() => {
    if (!didInitialBootstrapRef.current && !hasInitialBootstrap) {
      return;
    }

    if (
      hasInitialBootstrap &&
      !consumedInitialGroupsRef.current &&
      isInitialListKey &&
      page === initialPageRef.current
    ) {
      consumedInitialGroupsRef.current = true;
      return;
    }

    let cancelled = false;

    (async () => {
      setIsLoading(true);
      setError(null);

      const result = await getUserInventoryGroups({
        page,
        pageSize,
        query: debouncedQuery,
        sellerPersona,
        statusFilter,
      });

      if (cancelled) return;

      if (!result.success) {
        setError(result.error);
        setGroups([]);
        setTotalGroups(0);
        setTotalPages(0);
        setIsLoading(false);
        toast.error(result.error);
        return;
      }

      setGroups(result.data.groups);
      setTotalGroups(result.data.totalGroups);
      setTotalPages(result.data.totalPages);
      setPage(result.data.page);
      setError(null);
      setIsLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [
    page,
    pageSize,
    debouncedQuery,
    hasInitialBootstrap,
    isInitialListKey,
    sellerPersona,
    statusFilter,
  ]);

  return {
    groups,
    totalGroups,
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
  };
}
