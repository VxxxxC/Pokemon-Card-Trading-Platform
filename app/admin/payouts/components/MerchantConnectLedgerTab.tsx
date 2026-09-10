"use client";

import {
  listAdminMerchantTransfers,
  listAdminMerchantTransfersForExport,
  retryAdminMerchantConnectPayout,
} from "@/app/actions/admin-payouts";
import { getMerchantTransferRowId } from "@/lib/admin-payouts/merchant-transfer-row-id";
import {
  CALENDAR_POPOVER_CONTENT_CLASS,
  CALENDAR_TRIGGER_ICON_CLASS,
} from "@/lib/ui/calendar-theme";
import {
  BTN_OUTLINE_SM_CLASS,
  BTN_PRIMARY_CLASS,
  BTN_PRIMARY_SM_CLASS,
  FILTER_INPUT_CLASS,
  FORM_SELECT_TRIGGER_CLASS,
} from "@/app/admin/campaigns/campaigns-ui";
import { Pagination } from "@/app/components/ui/Pagination";
import { Input } from "@/components/ui/input";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  formatAdminHkd,
  formatCommissionRate,
  formatOrderAuthType,
  formatPayoutStatusLabel,
  getPayoutStatusBadgeClass,
} from "@/lib/admin-payouts/format";
import type {
  MerchantTransferPage,
  MerchantTransferRow,
  MerchantTransferSort,
  MerchantTransferStatusFilter,
} from "@/lib/admin-payouts/types";
import {
  MERCHANT_TRANSFERS_PAGE_SIZE,
  MERCHANT_TRANSFERS_EXPORT_CAP,
  getMerchantTransferPendingCount,
} from "@/lib/admin-payouts/types";
import {
  getStripeConnectDashboardUrl,
  getStripeTransferDashboardUrl,
} from "@/lib/stripe/dashboard-urls";
import { truncateStripeId } from "@/lib/stripe/display";
import { cn } from "@/lib/utils";
import { endOfDay, format, startOfDay, subDays } from "date-fns";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Calendar as CalendarIcon, Download, Search } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import type { DateRange } from "react-day-picker";
import { toast } from "sonner";
import BlockingLoadingOverlay from "./BlockingLoadingOverlay";
import { FilterChips, SelectionCountBadge, SortSelect } from "./payouts-shared";

const MERCHANT_SORT_OPTIONS: { value: MerchantTransferSort; label: string }[] =
  [
    { value: "transferred_at-desc", label: "撥款時間：最新優先" },
    { value: "transferred_at-asc", label: "撥款時間：最舊優先" },
    { value: "merchantName-asc", label: "商戶名稱：A → Z" },
    { value: "merchantName-desc", label: "商戶名稱：Z → A" },
  ];

const MERCHANT_SORT_OPTIONS_MOBILE: {
  value: MerchantTransferSort;
  label: string;
}[] = [
  { value: "transferred_at-desc", label: "最新" },
  { value: "transferred_at-asc", label: "最舊" },
  { value: "merchantName-asc", label: "名稱 A→Z" },
  { value: "merchantName-desc", label: "名稱 Z→A" },
];

const STATUS_FILTER_OPTIONS: {
  key: MerchantTransferStatusFilter;
  label: string;
}[] = [
  { key: "all", label: "全部" },
  { key: "paid", label: "已成功" },
  { key: "held", label: "保留中（T+7）" },
  { key: "processing", label: "處理中" },
  { key: "pending", label: "待撥款" },
  { key: "failed", label: "已失敗" },
  { key: "frozen", label: "已凍結" },
];

type MerchantConnectLedgerTabProps = {
  initialPage: MerchantTransferPage;
  loadError?: string;
  onTotalChange?: (total: number) => void;
};

function toIsoDateRange(range: DateRange | undefined): {
  dateFrom?: string;
  dateTo?: string;
} {
  if (!range?.from && !range?.to) {
    return {};
  }

  return {
    dateFrom: range.from ? startOfDay(range.from).toISOString() : undefined,
    dateTo: range.to ? endOfDay(range.to).toISOString() : undefined,
  };
}

function MerchantDateRangeFilter({
  dateRange,
  onChange,
  compact = false,
  triggerClassName,
}: {
  dateRange: DateRange | undefined;
  onChange: (range: DateRange | undefined) => void;
  compact?: boolean;
  triggerClassName?: string;
}) {
  return (
    <Popover>
      <PopoverTrigger
        className={cn(
          FORM_SELECT_TRIGGER_CLASS,
          "inline-flex w-auto shrink-0 items-center rounded-lg border",
          compact
            ? "h-8 gap-1 px-2 text-[11px]"
            : "h-9 gap-2 px-3 text-[12px]",
          triggerClassName,
        )}
      >
        <CalendarIcon
          className={cn(
            CALENDAR_TRIGGER_ICON_CLASS,
            compact ? "size-3" : "size-3.5",
          )}
          aria-hidden="true"
        />
        <span className="font-sans">
          {dateRange?.from ? (
            dateRange.to ? (
              compact ? (
                `${format(dateRange.from, "MM/dd")}-${format(dateRange.to, "MM/dd")}`
              ) : (
                `${format(dateRange.from, "yyyy/MM/dd")} - ${format(dateRange.to, "yyyy/MM/dd")}`
              )
            ) : (
              `${format(dateRange.from, "yyyy/MM/dd")} - 選擇`
            )
          ) : (
            "撥款日期"
          )}
        </span>
      </PopoverTrigger>
      <PopoverContent
        className={cn(CALENDAR_POPOVER_CONTENT_CLASS, "z-50")}
        align="end"
      >
        <div className="p-3 border-b border-[rgba(237,232,224,0.08)] flex items-center justify-between gap-4">
          <span className="font-sans text-xs font-semibold text-text-primary">
            撥款日期範圍篩選
          </span>
          <button
            type="button"
            onClick={() =>
              onChange({
                from: subDays(new Date(), 30),
                to: new Date(),
              })
            }
            className="font-mono text-[11px] text-brand hover:underline"
          >
            近 30 天
          </button>
        </div>
        <Calendar
          mode="range"
          selected={dateRange}
          onSelect={onChange}
          numberOfMonths={1}
          className="p-3"
        />
        {dateRange?.from ? (
          <div className="p-3 border-t border-[rgba(237,232,224,0.08)] flex justify-end">
            <button
              type="button"
              onClick={() => onChange(undefined)}
              className="font-mono text-[11px] text-text-secondary hover:text-brand"
            >
              清除日期
            </button>
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}

function MerchantTransferMobileCard({
  row,
  isSelected,
  isPending,
  retryingOrderId,
  onToggleSelect,
  onRetryPayout,
}: {
  row: MerchantTransferRow;
  isSelected: boolean;
  isPending: boolean;
  retryingOrderId: string | null;
  onToggleSelect: () => void;
  onRetryPayout: () => void;
}) {
  const transferLabel =
    row.stripeTransferId.length > 16
      ? `${row.stripeTransferId.slice(0, 14)}…`
      : row.stripeTransferId;
  const payoutTime =
    row.payoutStatus === "held" &&
    (!row.transferredAtIso || row.transferredAt === "—") &&
    row.payoutHoldUntil
      ? `保留至 ${row.payoutHoldUntil}`
      : row.transferredAt;

  const handleCardSelectToggle = () => {
    if (isPending) {
      return;
    }
    onToggleSelect();
  };

  return (
    <article
      className={`space-y-2.5 px-1 py-3 cursor-pointer rounded-lg transition-colors hover:bg-brand/5 ${
        isSelected ? "bg-brand/10" : ""
      }`}
      onClick={handleCardSelectToggle}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-start gap-2">
          <input
            type="checkbox"
            checked={isSelected}
            readOnly
            tabIndex={-1}
            aria-hidden="true"
            className="mt-1 shrink-0 rounded border-white/20 accent-brand pointer-events-none"
          />
          <div className="min-w-0">
            <p className="font-mono text-[11px] text-text-disabled">
              {row.stripeTransferId.startsWith("tr_") ? (
                <a
                  href={getStripeTransferDashboardUrl(row.stripeTransferId)}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(event) => event.stopPropagation()}
                  className="text-brand hover:underline"
                >
                  {transferLabel}
                </a>
              ) : (
                transferLabel
              )}
            </p>
            <Link
              href={`/marketplace/${row.merchantId}`}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(event) => event.stopPropagation()}
              className="font-sans text-[13px] font-semibold text-brand hover:underline"
            >
              {row.merchantName}
            </Link>
          </div>
        </div>
        <span
          className={`shrink-0 rounded border px-2 py-0.5 font-mono text-[9px] ${getPayoutStatusBadgeClass(row.payoutStatus)}`}
        >
          {formatPayoutStatusLabel(row.payoutStatus)}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1 font-mono text-[11px]">
        <span className="text-text-disabled">訂單</span>
        <Link
          href={`/profile/merchant/orderDetail/${row.orderId}`}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(event) => event.stopPropagation()}
          className="text-brand hover:underline"
        >
          {row.orderNumber}
        </Link>
        <span className="text-text-disabled">商戶實收</span>
        <span className="font-bold text-success">
          {formatAdminHkd(row.merchantPayoutAmount)}
        </span>
        <span className="text-text-disabled">平台分成</span>
        <span className="font-bold text-brand">
          {formatAdminHkd(row.platformCommission)}
        </span>
        <span className="text-text-disabled">撥款時間</span>
        <span className="text-text-secondary">{payoutTime}</span>
      </div>
      {row.payoutError && row.payoutStatus === "failed" ? (
        <p className="font-sans text-[10px] text-warning">{row.payoutError}</p>
      ) : null}
      {row.reconciliationWarning ? (
        <p className="font-sans text-[10px] text-warning">
          ⚠ {row.reconciliationWarning}
        </p>
      ) : null}
      <div
        className="flex flex-wrap gap-1.5 pt-1"
        onClick={(event) => event.stopPropagation()}
      >
        {row.payoutStatus === "failed" ? (
          <button
            type="button"
            disabled={retryingOrderId === row.orderId || isPending}
            onClick={onRetryPayout}
            className={BTN_PRIMARY_SM_CLASS}
          >
            重試撥款
          </button>
        ) : null}
        <a
          href={`/profile/merchant/orderDetail/${row.orderId}`}
          target="_blank"
          rel="noopener noreferrer"
          className={`${BTN_OUTLINE_SM_CLASS} inline-flex h-8 items-center px-2.5 text-brand`}
        >
          查看訂單
        </a>
      </div>
    </article>
  );
}

export default function MerchantConnectLedgerTab({
  initialPage,
  loadError,
  onTotalChange,
}: MerchantConnectLedgerTabProps) {
  const [isPending, startTransition] = useTransition();
  const [isExportingCsv, setIsExportingCsv] = useState(false);
  const [retryingOrderId, setRetryingOrderId] = useState<string | null>(null);

  const [pageData, setPageData] = useState<MerchantTransferPage>(initialPage);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] =
    useState<MerchantTransferStatusFilter>("all");
  const [sort, setSort] = useState<MerchantTransferSort>("transferred_at-desc");
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [allFilteredSelected, setAllFilteredSelected] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const skipFilterFetchRef = useRef(true);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearch(search.trim());
    }, 400);
    return () => window.clearTimeout(timer);
  }, [search]);

  const fetchPage = useCallback(
    (overrides: {
      page?: number;
      search?: string;
      statusFilter?: MerchantTransferStatusFilter;
      sort?: MerchantTransferSort;
      dateRange?: DateRange | undefined;
    }) => {
      const nextPage = overrides.page ?? pageData.page;
      const nextSearch =
        overrides.search !== undefined ? overrides.search : debouncedSearch;
      const nextStatus =
        overrides.statusFilter !== undefined
          ? overrides.statusFilter
          : statusFilter;
      const nextSort = overrides.sort ?? sort;
      const nextRange =
        overrides.dateRange !== undefined ? overrides.dateRange : dateRange;
      const { dateFrom, dateTo } = toIsoDateRange(nextRange);

      startTransition(async () => {
        const result = await listAdminMerchantTransfers({
          page: nextPage,
          pageSize: MERCHANT_TRANSFERS_PAGE_SIZE,
          search: nextSearch || undefined,
          statusFilter: nextStatus,
          sort: nextSort,
          dateFrom,
          dateTo,
        });

        if (!result.success) {
          setFetchError(result.error);
          return;
        }

        setFetchError(null);
        setPageData(result.data);
        onTotalChange?.(
          getMerchantTransferPendingCount(result.data.statusCounts),
        );
      });
    },
    [
      pageData.page,
      debouncedSearch,
      statusFilter,
      sort,
      dateRange,
      onTotalChange,
    ],
  );

  useEffect(() => {
    if (skipFilterFetchRef.current) {
      skipFilterFetchRef.current = false;
      return;
    }
    fetchPage({ page: 1 });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refetch when filters change
  }, [debouncedSearch, statusFilter, sort, dateRange]);

  const statusChipOptions = useMemo(
    () =>
      STATUS_FILTER_OPTIONS.map((option) => ({
        ...option,
        count: pageData.statusCounts[option.key],
      })),
    [pageData.statusCounts],
  );

  const handleSearchChange = (value: string) => {
    setSearch(value);
    resetSelection();
  };

  const handleStatusFilterChange = (filter: MerchantTransferStatusFilter) => {
    setStatusFilter(filter);
    resetSelection();
  };

  const handleSortChange = (value: MerchantTransferSort) => {
    setSort(value);
    resetSelection();
  };

  const handleDateRangeChange = (range: DateRange | undefined) => {
    setDateRange(range);
    resetSelection();
  };

  const handlePageChange = (page: number) => {
    if (!allFilteredSelected) {
      resetSelection();
    }
    fetchPage({ page });
  };

  const resetSelection = () => {
    setAllFilteredSelected(false);
    setSelectedIds(new Set());
  };

  const isRowSelected = (id: string) =>
    allFilteredSelected || selectedIds.has(id);

  const selectedCount = allFilteredSelected
    ? pageData.total
    : selectedIds.size;

  const hasSelection = allFilteredSelected || selectedIds.size > 0;

  const toggleSelectAll = () => {
    if (allFilteredSelected) {
      resetSelection();
      return;
    }
    setAllFilteredSelected(true);
    setSelectedIds(
      new Set(pageData.rows.map((row) => getMerchantTransferRowId(row))),
    );
  };

  const toggleSelectRow = (id: string) => {
    if (allFilteredSelected) {
      setAllFilteredSelected(false);
      setSelectedIds(
        new Set(
          pageData.rows
            .map((row) => getMerchantTransferRowId(row))
            .filter((rowId) => rowId !== id),
        ),
      );
      return;
    }

    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const clearSelection = () => {
    resetSelection();
  };

  const handleExportCsv = async () => {
    const { dateFrom, dateTo } = toIsoDateRange(dateRange);

    setIsExportingCsv(true);
    try {
      const result = await listAdminMerchantTransfersForExport({
        search: debouncedSearch || undefined,
        statusFilter,
        sort,
        dateFrom,
        dateTo,
      });

      if (!result.success) {
        toast.error(result.error);
        return;
      }

      const targetRows = result.data.rows;
      const totalMatching = result.data.total;

      if (targetRows.length === 0) {
        toast.warning("沒有可導出的商戶流水紀錄！");
        return;
      }

      const headers =
        "Stripe流水號,訂單號,商戶名稱,Stripe帳戶ID,訂單類型,卡價小計(HK$),佣金率,平台分成(HK$),鑑定費(HK$),商戶實收(HK$),撥款狀態,撥款錯誤,買家確認時間,PaymentIntent,撥款時間\n";
      const rows = targetRows
        .map((row) =>
          [
            `"${row.stripeTransferId}"`,
            `"${row.orderNumber}"`,
            `"${row.merchantName}"`,
            `"${row.subAccountId}"`,
            formatOrderAuthType(row.requiresAuthentication),
            row.itemSubtotal,
            formatCommissionRate(row.commissionRateApplied),
            row.platformCommission,
            row.authFee,
            row.merchantPayoutAmount,
            formatPayoutStatusLabel(row.payoutStatus),
            `"${(row.payoutError ?? "").replace(/"/g, '""')}"`,
            `"${row.buyerConfirmedAt ?? "—"}"`,
            `"${row.stripePaymentIntentId ?? "—"}"`,
            `"${row.transferredAt}"`,
          ].join(","),
        )
        .join("\n");

      const csvContent =
        "data:text/csv;charset=utf-8," + encodeURIComponent(headers + rows);
      const link = document.createElement("a");
      link.setAttribute("href", csvContent);
      link.setAttribute(
        "download",
        `HKCV_Merchant_Stripe_Export_${new Date().toISOString().split("T")[0]}.csv`,
      );
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      const capped = totalMatching > MERCHANT_TRANSFERS_EXPORT_CAP;
      if (capped) {
        toast.success(
          `已導出 ${targetRows.length} 筆（共 ${totalMatching.toLocaleString("en-US")} 筆符合篩選，已達單次上限 ${MERCHANT_TRANSFERS_EXPORT_CAP.toLocaleString("en-US")}）`,
        );
        return;
      }

      toast.success(`已成功導出 ${targetRows.length} 筆商戶流水 CSV 文件！`);
    } catch {
      toast.error("導出商戶流水 CSV 失敗，請稍後再試");
    } finally {
      setIsExportingCsv(false);
    }
  };

  const handleRetryPayout = (orderId: string) => {
    setRetryingOrderId(orderId);
    startTransition(async () => {
      try {
        const result = await retryAdminMerchantConnectPayout(orderId);
        if (!result.success) {
          toast.error(result.error);
          return;
        }
        toast.success(
          result.data.transferId
            ? `撥款重試成功（${result.data.transferId}）`
            : "撥款重試成功",
        );
        fetchPage({ page: pageData.page });
      } catch {
        toast.error("重試撥款失敗，請稍後再試");
      } finally {
        setRetryingOrderId(null);
      }
    });
  };

  const displayError = loadError ?? fetchError;
  const pageSize = pageData.pageSize;
  const totalPages = pageData.totalPages || 1;

  return (
    <div className="space-y-4">
      <BlockingLoadingOverlay
        open={isExportingCsv}
        message="正在導出商戶流水 CSV…"
      />
      {displayError ? (
        <div className="rounded-lg border border-warning/30 bg-warning/10 px-3 py-2.5 font-sans text-[13px] text-warning">
          {displayError}
        </div>
      ) : null}

      <section
        className="space-y-2 border-b border-white/[0.08] pb-4"
        aria-label="商戶流水篩選與操作"
      >
        <div className="flex items-center gap-2">
          <div className="relative min-w-0 flex-1">
            <Search
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-text-disabled"
              aria-hidden="true"
            />
            <Input
              type="search"
              placeholder="搜尋商戶名稱、Stripe 流水號或訂單號…"
              value={search}
              onChange={(e) => handleSearchChange(e.target.value)}
              className={FILTER_INPUT_CLASS}
            />
          </div>
          <div className="shrink-0 md:hidden">
            <MerchantDateRangeFilter
              compact
              triggerClassName="h-9"
              dateRange={dateRange}
              onChange={handleDateRangeChange}
            />
          </div>
        </div>

        <div className="flex items-center gap-2 md:block">
          <FilterChips
            options={statusChipOptions}
            active={statusFilter}
            onSelect={handleStatusFilterChange}
            scrollable
            className="min-w-0 flex-1 md:flex-none"
          />
          <div className="shrink-0 md:hidden">
            <SortSelect
              compact
              value={sort}
              options={MERCHANT_SORT_OPTIONS_MOBILE}
              onChange={handleSortChange}
              ariaLabelPrefix="撥款時間"
            />
          </div>
        </div>

        <div className="hidden items-center justify-between gap-2 md:flex">
          {pageData.rows.length > 0 ? (
            <div className="flex items-center gap-2 text-[11px]">
              {hasSelection ? (
                <SelectionCountBadge
                  count={selectedCount}
                  onClear={clearSelection}
                  disabled={isPending || isExportingCsv}
                />
              ) : null}
              {!allFilteredSelected && pageData.total > 0 ? (
                <button
                  type="button"
                  onClick={toggleSelectAll}
                  disabled={isPending || isExportingCsv}
                  className="shrink-0 font-sans text-brand transition-colors hover:underline disabled:opacity-50"
                >
                  全選
                </button>
              ) : null}
              {hasSelection ? (
                <button
                  type="button"
                  onClick={() => void handleExportCsv()}
                  disabled={isPending || isExportingCsv}
                  className={`${BTN_OUTLINE_SM_CLASS} shrink-0 gap-1.5 text-brand`}
                >
                  <Download className="size-3.5 shrink-0" aria-hidden="true" />
                  <span>導出記錄</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => void handleExportCsv()}
                  disabled={isPending || isExportingCsv}
                  className={BTN_PRIMARY_CLASS}
                >
                  全量導出商戶 CSV
                </button>
              )}
            </div>
          ) : (
            <div />
          )}
          <div className="flex items-center gap-2">
            <MerchantDateRangeFilter
              dateRange={dateRange}
              onChange={handleDateRangeChange}
            />
            <SortSelect
              value={sort}
              options={MERCHANT_SORT_OPTIONS}
              onChange={handleSortChange}
              ariaLabelPrefix="撥款時間"
            />
          </div>
        </div>
      </section>

      {pageData.rows.length === 0 ? (
        <p className="py-10 text-center font-sans text-[13px] text-text-secondary">
          沒有符合篩選條件的商戶流水記錄。
        </p>
      ) : (
        <>
          <div className="md:hidden">
            {pageData.rows.length > 0 ? (
              <div
                className="mb-2.5 flex items-center justify-between gap-2 px-1 min-h-8 text-[11px]"
              >
                <div className="flex items-center gap-1.5 min-w-0">
                  {hasSelection ? (
                    <SelectionCountBadge
                      count={selectedCount}
                      onClear={clearSelection}
                      disabled={isPending || isExportingCsv}
                    />
                  ) : null}
                  {!allFilteredSelected && pageData.total > 0 ? (
                    <button
                      type="button"
                      onClick={toggleSelectAll}
                      disabled={isPending || isExportingCsv}
                      className="shrink-0 font-sans text-[10px] text-brand transition-colors hover:underline disabled:opacity-50"
                    >
                      全選
                    </button>
                  ) : null}
                </div>
                {hasSelection ? (
                  <button
                    type="button"
                    onClick={() => void handleExportCsv()}
                    disabled={isPending || isExportingCsv}
                    className={`${BTN_OUTLINE_SM_CLASS} shrink-0 gap-1 text-brand`}
                  >
                    <Download
                      className="size-3.5 shrink-0"
                      aria-hidden="true"
                    />
                    <span>導出記錄</span>
                  </button>
                ) : null}
              </div>
            ) : null}
            <div
              className={`space-y-2 ${isPending ? "opacity-60" : ""}`}
            >
            {pageData.rows.map((row) => {
              const rowId = getMerchantTransferRowId(row);
              return (
                <MerchantTransferMobileCard
                  key={rowId}
                  row={row}
                  isSelected={isRowSelected(rowId)}
                  isPending={isPending}
                  retryingOrderId={retryingOrderId}
                  onToggleSelect={() => toggleSelectRow(rowId)}
                  onRetryPayout={() => handleRetryPayout(row.orderId)}
                />
              );
            })}
            </div>
          </div>

          <div
            className={`hidden overflow-x-auto rounded-lg border border-white/[0.08] md:block ${isPending ? "opacity-60" : ""}`}
          >
        <Table>
          <TableHeader className="border-b border-white/[0.08] bg-bg-card/30">
            <TableRow className="border-transparent hover:bg-transparent">
              <TableHead className="h-9 w-10 text-center">
                <input
                  type="checkbox"
                  checked={
                    allFilteredSelected ||
                    (pageData.rows.length > 0 &&
                      pageData.rows.every((row) =>
                        isRowSelected(getMerchantTransferRowId(row)),
                      ))
                  }
                  onChange={toggleSelectAll}
                  className="rounded border-white/20 accent-brand cursor-pointer"
                />
              </TableHead>
              <TableHead className="h-9 font-mono text-[11px] text-text-disabled whitespace-nowrap">
                Stripe 流水號
              </TableHead>
              <TableHead className="h-9 font-mono text-[11px] text-text-disabled whitespace-nowrap">
                訂單號
              </TableHead>
              <TableHead className="h-9 font-sans text-[11px] text-text-disabled whitespace-nowrap">
                商戶名稱
              </TableHead>
              <TableHead className="h-9 font-mono text-[11px] text-text-disabled whitespace-nowrap">
                Stripe 帳戶 ID
              </TableHead>
              <TableHead className="h-9 font-sans text-[11px] text-text-disabled whitespace-nowrap">
                訂單類型
              </TableHead>
              <TableHead className="h-9 text-right font-mono text-[11px] text-text-disabled whitespace-nowrap">
                卡價小計
              </TableHead>
              <TableHead className="h-9 text-right font-mono text-[11px] text-text-disabled whitespace-nowrap">
                佣金率
              </TableHead>
              <TableHead className="h-9 text-right font-mono text-[11px] text-text-disabled whitespace-nowrap">
                平台分成
              </TableHead>
              <TableHead className="h-9 text-right font-mono text-[11px] text-text-disabled whitespace-nowrap">
                鑑定費
              </TableHead>
              <TableHead className="h-9 text-right font-mono text-[11px] text-text-disabled whitespace-nowrap">
                商戶實收 (Transfer)
              </TableHead>
              <TableHead className="h-9 text-center font-sans text-[11px] text-text-disabled whitespace-nowrap">
                撥款狀態
              </TableHead>
              <TableHead className="h-9 text-center font-sans text-[11px] text-text-disabled whitespace-nowrap">
                對賬
              </TableHead>
              <TableHead className="h-9 font-mono text-[11px] text-text-disabled whitespace-nowrap">
                買家確認時間
              </TableHead>
              <TableHead className="h-9 font-mono text-[11px] text-text-disabled whitespace-nowrap">
                PaymentIntent
              </TableHead>
              <TableHead className="h-9 font-mono text-[11px] text-text-disabled whitespace-nowrap">
                撥款時間
              </TableHead>
              <TableHead className="h-9 min-w-[5.5rem] text-right font-sans text-[11px] text-text-disabled whitespace-nowrap">
                操作
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pageData.rows.map((row, rowIndex) => {
              const rowId = getMerchantTransferRowId(row);
              const isSelected = isRowSelected(rowId);
              const statusBadge = (
                <span
                  className={`inline-block font-mono text-[9px] px-2 py-0.5 rounded border ${getPayoutStatusBadgeClass(row.payoutStatus)}`}
                >
                  {formatPayoutStatusLabel(row.payoutStatus)}
                </span>
              );

              return (
                <TableRow
                  key={rowId}
                  className={`border-white/[0.06] transition-colors hover:bg-brand/10 ${
                    rowIndex % 2 === 0 ? "bg-bg-card/25" : "bg-white/[0.02]"
                  } ${isSelected ? "bg-brand/10" : ""}`}
                >
                  <TableCell className="w-10 py-2.5 text-center">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleSelectRow(rowId)}
                      className="rounded border-[rgba(237,232,224,0.2)] bg-bg-card accent-brand cursor-pointer"
                    />
                  </TableCell>
                  <TableCell className="font-mono text-[11px] text-brand font-bold py-3 whitespace-nowrap">
                    {row.stripeTransferId.startsWith("tr_") ? (
                      <a
                        href={getStripeTransferDashboardUrl(
                          row.stripeTransferId,
                        )}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:underline"
                      >
                        {row.stripeTransferId}
                      </a>
                    ) : (
                      row.stripeTransferId
                    )}
                  </TableCell>
                  <TableCell className="font-mono text-[11px] text-text-disabled py-3 whitespace-nowrap">
                    <Link
                      href={`/profile/merchant/orderDetail/${row.orderId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-brand hover:underline"
                    >
                      {row.orderNumber}
                    </Link>
                  </TableCell>
                  <TableCell className="font-sans font-semibold text-[13px] text-text-primary py-3 whitespace-nowrap">
                    <Link
                      href={`/marketplace/${row.merchantId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-brand hover:underline"
                    >
                      {row.merchantName}
                    </Link>
                  </TableCell>
                  <TableCell className="font-mono text-[11px] text-text-disabled py-3 whitespace-nowrap">
                    {row.subAccountId.startsWith("acct_") ? (
                      <a
                        href={getStripeConnectDashboardUrl(row.subAccountId)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-brand hover:underline"
                      >
                        {row.subAccountId}
                      </a>
                    ) : (
                      row.subAccountId
                    )}
                  </TableCell>
                  <TableCell className="font-sans text-[12px] text-text-primary py-3 whitespace-nowrap">
                    {formatOrderAuthType(row.requiresAuthentication)}
                  </TableCell>
                  <TableCell className="font-mono font-bold text-[13px] text-text-primary text-right py-3 whitespace-nowrap">
                    {formatAdminHkd(row.itemSubtotal)}
                  </TableCell>
                  <TableCell className="font-mono text-[12px] text-text-secondary text-right py-3 whitespace-nowrap">
                    {formatCommissionRate(row.commissionRateApplied)}
                  </TableCell>
                  <TableCell className="font-mono font-bold text-[13px] text-brand text-right py-3 whitespace-nowrap">
                    {formatAdminHkd(row.platformCommission)}
                  </TableCell>
                  <TableCell className="font-mono text-[12px] text-text-secondary text-right py-3 whitespace-nowrap">
                    {formatAdminHkd(row.authFee)}
                  </TableCell>
                  <TableCell className="font-mono font-bold text-[13px] text-success text-right py-3 whitespace-nowrap">
                    {formatAdminHkd(row.merchantPayoutAmount)}
                  </TableCell>
                  <TableCell className="text-center py-3 whitespace-nowrap">
                    {row.payoutStatus === "failed" ? (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger>
                            <span className="cursor-help inline-block">
                              {statusBadge}
                            </span>
                          </TooltipTrigger>
                          <TooltipContent
                            side="top"
                            className="max-w-sm border border-white/10 bg-[#2e2925] text-[#eae1da]"
                          >
                            {row.payoutError ?? "未知錯誤"}
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    ) : (
                      statusBadge
                    )}
                  </TableCell>
                  <TableCell className="text-center py-3 whitespace-nowrap">
                    {row.reconciliationWarning ? (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger>
                            <span className="cursor-help text-warning text-sm inline-block">
                              ⚠
                            </span>
                          </TooltipTrigger>
                          <TooltipContent
                            side="top"
                            className="max-w-sm border border-white/10 bg-[#2e2925] text-[#eae1da]"
                          >
                            {row.reconciliationWarning}
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    ) : (
                      <span className="text-text-disabled">—</span>
                    )}
                  </TableCell>
                  <TableCell className="font-mono text-[11px] text-text-disabled py-3 whitespace-nowrap">
                    {row.buyerConfirmedAt ?? "—"}
                  </TableCell>
                  <TableCell
                    className="font-mono text-[11px] text-text-disabled py-3 whitespace-nowrap"
                    title={row.stripePaymentIntentId ?? undefined}
                  >
                    {truncateStripeId(row.stripePaymentIntentId)}
                  </TableCell>
                  <TableCell className="font-mono text-[11px] text-text-disabled py-3 whitespace-nowrap">
                    {row.payoutStatus === "held" &&
                    (!row.transferredAtIso || row.transferredAt === "—") &&
                    row.payoutHoldUntil ? (
                      <span title={`保留至 ${row.payoutHoldUntil}`}>
                        保留至 {row.payoutHoldUntil}
                      </span>
                    ) : (
                      row.transferredAt
                    )}
                  </TableCell>
                  <TableCell className="text-right py-2.5 whitespace-nowrap">
                    <div className="flex justify-end items-center gap-1.5">
                      {row.payoutStatus === "failed" ? (
                        <button
                          type="button"
                          disabled={retryingOrderId === row.orderId || isPending}
                          onClick={() => handleRetryPayout(row.orderId)}
                          className={BTN_PRIMARY_SM_CLASS}
                        >
                          重試撥款
                        </button>
                      ) : null}
                      <a
                        href={`/profile/merchant/orderDetail/${row.orderId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`${BTN_OUTLINE_SM_CLASS} inline-flex h-8 items-center px-2.5 text-brand`}
                      >
                        查看訂單
                      </a>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
          </div>

          {pageData.total > 0 && totalPages <= 1 ? (
            <p className="font-mono text-[12px] text-text-secondary">
              共 {pageData.total} 筆資料{isPending ? "（更新中…）" : ""}
            </p>
          ) : null}
          {pageData.total > 0 && totalPages > 1 ? (
            <Pagination
              currentPage={pageData.page}
              totalPages={totalPages}
              onPageChange={handlePageChange}
              totalItems={pageData.total}
              itemsPerPage={pageSize}
              itemLabel="筆資料"
              enableScroll={false}
            />
          ) : null}
        </>
      )}
    </div>
  );
}
