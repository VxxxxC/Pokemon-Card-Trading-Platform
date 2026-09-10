import type {
  MerchantFinanceSort,
  MerchantFinanceStatusFilter,
} from "@/app/actions/merchant-finance";

export type MerchantFinanceQuery = {
  page: number;
  pageSize: number;
  statusFilter: MerchantFinanceStatusFilter;
  sort: MerchantFinanceSort;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
};

const STATUS_FILTERS = new Set<MerchantFinanceStatusFilter>([
  "all",
  "paid",
  "held",
  "processing",
  "failed",
]);

const SORT_OPTIONS = new Set<MerchantFinanceSort>([
  "transferred_at-desc",
  "transferred_at-asc",
]);

function parsePositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseStatusFilter(value: string | undefined): MerchantFinanceStatusFilter {
  if (value && STATUS_FILTERS.has(value as MerchantFinanceStatusFilter)) {
    return value as MerchantFinanceStatusFilter;
  }
  return "all";
}

function parseSort(value: string | undefined): MerchantFinanceSort {
  if (value && SORT_OPTIONS.has(value as MerchantFinanceSort)) {
    return value as MerchantFinanceSort;
  }
  return "transferred_at-desc";
}

export function parseMerchantFinanceQuery(
  params: Record<string, string | string[] | undefined> = {},
): MerchantFinanceQuery {
  const read = (key: string): string | undefined => {
    const raw = params[key];
    if (Array.isArray(raw)) {
      return raw[0];
    }
    return raw;
  };

  return {
    page: parsePositiveInt(read("page"), 1),
    pageSize: Math.min(50, Math.max(5, parsePositiveInt(read("pageSize"), 10))),
    statusFilter: parseStatusFilter(read("status")),
    sort: parseSort(read("sort")),
    dateFrom: read("dateFrom")?.trim() || undefined,
    dateTo: read("dateTo")?.trim() || undefined,
    search: read("search")?.trim() || undefined,
  };
}

export function buildMerchantFinanceHref(
  query: MerchantFinanceQuery,
  overrides: Partial<MerchantFinanceQuery> = {},
): string {
  const merged = { ...query, ...overrides };
  const params = new URLSearchParams();

  if (merged.page > 1) {
    params.set("page", String(merged.page));
  }
  if (merged.pageSize !== 10) {
    params.set("pageSize", String(merged.pageSize));
  }
  if (merged.statusFilter !== "all") {
    params.set("status", merged.statusFilter);
  }
  if (merged.sort !== "transferred_at-desc") {
    params.set("sort", merged.sort);
  }
  if (merged.dateFrom) {
    params.set("dateFrom", merged.dateFrom);
  }
  if (merged.dateTo) {
    params.set("dateTo", merged.dateTo);
  }
  if (merged.search) {
    params.set("search", merged.search);
  }

  const qs = params.toString();
  return qs ? `/profile/merchant/finance?${qs}` : "/profile/merchant/finance";
}
