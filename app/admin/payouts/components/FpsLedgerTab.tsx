"use client";

import {
  batchCompleteAdminPayoutRequests,
  listAdminPayoutRequests,
  listAdminPayoutRequestsForExport,
  updateAdminPayoutRequestStatus,
} from "@/app/actions/admin-payouts";
import {
  BTN_OUTLINE_SM_CLASS,
  BTN_PRIMARY_SM_CLASS,
  FILTER_INPUT_CLASS,
} from "@/app/admin/campaigns/campaigns-ui";
import { Pagination } from "@/app/components/ui/Pagination";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { isFpsPayoutBlockedForComplete } from "@/lib/admin-payouts/fps-payout-guards";
import {
  formatAdminHkd,
  formatFpsPayoutStatusLabel,
  getFpsPayoutStatusBadgeClass,
  isFpsPayoutIncomplete,
} from "@/lib/admin-payouts/format";
import type {
  FpsPayoutPage,
  FpsPayoutRow,
  FpsPayoutSort,
  FpsPayoutStatusFilter,
} from "@/lib/admin-payouts/types";
import { FPS_EXPORT_CAP, FPS_PAYOUT_REQUESTS_PAGE_SIZE } from "@/lib/admin-payouts/types";
import { Download, Search } from "lucide-react";
import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { toast } from "sonner";
import BlockingLoadingOverlay from "./BlockingLoadingOverlay";
import { FilterChips, SelectionCountBadge, SortSelect } from "./payouts-shared";

const FPS_SORT_OPTIONS: { value: FpsPayoutSort; label: string }[] = [
  { value: "submittedAt-desc", label: "最新" },
  { value: "submittedAt-asc", label: "最舊" },
  { value: "userName-asc", label: "名稱 A→Z" },
  { value: "userName-desc", label: "名稱 Z→A" },
];

const STATUS_FILTER_OPTIONS: {
  key: FpsPayoutStatusFilter;
  label: string;
}[] = [
  { key: "all", label: "全部" },
  { key: "incomplete", label: "未完成" },
  { key: "completed", label: "已完成" },
  { key: "failed", label: "已駁回" },
];

type FpsLedgerTabProps = {
  initialPage: FpsPayoutPage;
  loadError?: string;
  onTotalChange?: (total: number) => void;
};

function formatRequestId(requestId: string): string {
  if (requestId.length <= 12) {
    return `#${requestId}`;
  }
  return `#${requestId.slice(0, 8)}`;
}

function isFpsRowSelectable(row: FpsPayoutRow): boolean {
  return (
    isFpsPayoutIncomplete(row.status) &&
    !isFpsPayoutBlockedForComplete({
      status: row.status,
      fpsId: row.fpsId,
      fpsName: row.fpsName,
    })
  );
}

function getSelectableFpsRequestIds(rows: FpsPayoutRow[]): string[] {
  return rows.filter(isFpsRowSelectable).map((row) => row.requestId);
}

function FpsPayoutMobileCard({
  row,
  isSelected,
  canSelect,
  isMutating,
  blockedForComplete,
  onToggleSelect,
  onComplete,
  onReject,
}: {
  row: FpsPayoutRow;
  isSelected: boolean;
  canSelect: boolean;
  isMutating: boolean;
  blockedForComplete: boolean;
  onToggleSelect: () => void;
  onComplete: () => void;
  onReject: () => void;
}) {
  const canAct = isFpsPayoutIncomplete(row.status);

  const handleCardSelectToggle = () => {
    if (!canSelect || isMutating) {
      return;
    }
    onToggleSelect();
  };

  return (
    <article
      className={`space-y-2.5 px-1 py-3 ${
        canSelect
          ? `cursor-pointer rounded-lg transition-colors hover:bg-brand/5 ${
              isSelected ? "bg-brand/10" : ""
            }`
          : ""
      }`}
      onClick={canSelect ? handleCardSelectToggle : undefined}
    >
      <div className="flex items-start gap-2">
        {canSelect ? (
          <input
            type="checkbox"
            checked={isSelected}
            readOnly
            tabIndex={-1}
            aria-hidden="true"
            className="mt-1 shrink-0 rounded border-white/20 accent-brand pointer-events-none"
          />
        ) : null}
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <Link
              href={`/profile/${row.sellerId}`}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(event) => event.stopPropagation()}
              className="truncate font-sans text-[14px] font-semibold text-brand hover:underline"
            >
              {row.sellerName}
            </Link>
            <span
              className={`shrink-0 rounded border px-2 py-0.5 font-mono text-[9px] ${getFpsPayoutStatusBadgeClass(row.status)}`}
            >
              {formatFpsPayoutStatusLabel(row.status)}
            </span>
          </div>
        </div>
      </div>

      <div className="flex items-baseline justify-between gap-3 rounded-lg bg-bg-page/30 px-3 py-2">
        <span className="font-sans text-[10px] text-text-disabled shrink-0">
          提現金額
        </span>
        <div className="min-w-0 text-right">
          <p className="font-mono text-[16px] font-bold leading-none text-text-primary">
            {formatAdminHkd(row.amount)}
          </p>
          {row.fpsTransferFeeHkd > 0 ? (
            <p className="mt-1 font-mono text-[10px] text-text-disabled">
              毛額 {formatAdminHkd(row.grossPayoutHkd)} · 手續費{" "}
              {formatAdminHkd(row.fpsTransferFeeHkd)}
            </p>
          ) : null}
        </div>
      </div>

      <div className="space-y-1.5 rounded-lg bg-bg-page/20 px-3 py-2 font-mono text-[11px]">
        <div className="flex items-center justify-between gap-3">
          <span className="shrink-0 text-text-disabled">訂單</span>
          <Link
            href={`/profile/user/orderDetail/${row.orderNumber}`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(event) => event.stopPropagation()}
            className="truncate text-right text-brand hover:underline"
          >
            {row.orderNumber}
          </Link>
        </div>
        {row.fpsName ? (
          <div className="flex items-center justify-between gap-3">
            <span className="shrink-0 text-text-disabled">收款人</span>
            <span className="truncate text-right text-text-primary">
              {row.fpsName}
            </span>
          </div>
        ) : null}
        <div className="flex items-center justify-between gap-3">
          <span className="shrink-0 text-text-disabled">FPS ID</span>
          <span className="truncate text-right font-bold text-text-primary">
            {row.fpsId}
          </span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="shrink-0 text-text-disabled">提交時間</span>
          <span className="truncate text-right text-text-secondary">
            {row.submittedAt}
          </span>
        </div>
        <div className="flex items-start justify-between gap-3">
          <span className="shrink-0 text-text-disabled">提現單號</span>
          <span className="break-all text-right text-text-secondary">
            {row.requestId}
          </span>
        </div>
        {row.status === "completed" ? (
          <div className="flex items-center justify-between gap-3">
            <span className="shrink-0 text-text-disabled">FPS 參考</span>
            <span
              className="truncate text-right text-text-primary"
              title={row.adminFpsReference ?? undefined}
            >
              {row.adminFpsReference ?? "—"}
            </span>
          </div>
        ) : null}
      </div>

      {blockedForComplete ? (
        <p className="font-sans text-[10px] text-text-disabled">待賣家補 FPS</p>
      ) : null}
      {canAct ? (
        <div
          className="flex gap-2"
          onClick={(event) => event.stopPropagation()}
        >
          {!blockedForComplete ? (
            <button
              type="button"
              onClick={onComplete}
              disabled={isMutating}
              className={`${BTN_PRIMARY_SM_CLASS} flex-1`}
            >
              銷帳
            </button>
          ) : null}
          <button
            type="button"
            onClick={onReject}
            disabled={isMutating}
            className={`${BTN_OUTLINE_SM_CLASS} flex-1 border-warning/30 text-warning hover:border-warning/40 hover:bg-warning/10 hover:text-warning`}
          >
            駁回
          </button>
        </div>
      ) : null}
    </article>
  );
}

export default function FpsLedgerTab({
  initialPage,
  loadError,
  onTotalChange,
}: FpsLedgerTabProps) {
  const [isPending, startTransition] = useTransition();
  const [isExportingCsv, setIsExportingCsv] = useState(false);
  const [isMutating, setIsMutating] = useState(false);

  const [pageData, setPageData] = useState<FpsPayoutPage>(initialPage);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] =
    useState<FpsPayoutStatusFilter>("incomplete");
  const [sort, setSort] = useState<FpsPayoutSort>("submittedAt-desc");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [allFilteredSelected, setAllFilteredSelected] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [completeDialogRequestId, setCompleteDialogRequestId] = useState<
    string | null
  >(null);
  const [adminFpsReference, setAdminFpsReference] = useState("");
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
      statusFilter?: FpsPayoutStatusFilter;
      sort?: FpsPayoutSort;
    }) => {
      const nextPage = overrides.page ?? pageData.page;
      const nextSearch =
        overrides.search !== undefined ? overrides.search : debouncedSearch;
      const nextStatus =
        overrides.statusFilter !== undefined
          ? overrides.statusFilter
          : statusFilter;
      const nextSort = overrides.sort ?? sort;

      startTransition(async () => {
        const result = await listAdminPayoutRequests({
          page: nextPage,
          pageSize: FPS_PAYOUT_REQUESTS_PAGE_SIZE,
          search: nextSearch || undefined,
          statusFilter: nextStatus,
          sort: nextSort,
        });

        if (!result.success) {
          setFetchError(result.error);
          return;
        }

        setFetchError(null);
        setPageData(result.data);
        onTotalChange?.(result.data.statusCounts.incomplete);
      });
    },
    [pageData.page, debouncedSearch, statusFilter, sort, onTotalChange],
  );

  useEffect(() => {
    if (skipFilterFetchRef.current) {
      skipFilterFetchRef.current = false;
      return;
    }
    fetchPage({ page: 1 });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refetch when filters change
  }, [debouncedSearch, statusFilter, sort]);

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

  const handleStatusFilterChange = (filter: FpsPayoutStatusFilter) => {
    setStatusFilter(filter);
    resetSelection();
  };

  const handleSortChange = (value: FpsPayoutSort) => {
    setSort(value);
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

  const clearSelection = () => {
    resetSelection();
  };

  const toggleSelectAll = () => {
    if (allFilteredSelected) {
      resetSelection();
      return;
    }

    const selectableIds = getSelectableFpsRequestIds(pageData.rows);
    if (selectableIds.length === 0) {
      return;
    }

    setAllFilteredSelected(true);
    setSelectedIds(new Set(selectableIds));
  };

  const toggleSelectRow = (id: string) => {
    if (allFilteredSelected) {
      setAllFilteredSelected(false);
      setSelectedIds(
        new Set(getSelectableFpsRequestIds(pageData.rows).filter((rowId) => rowId !== id)),
      );
      return;
    }

    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const handleExportCsv = async (exportSelectedOnly = false) => {
    setIsExportingCsv(true);
    try {
      const result = await listAdminPayoutRequestsForExport({
        search: debouncedSearch || undefined,
        statusFilter,
        sort,
      });

      if (!result.success) {
        toast.error(result.error);
        return;
      }

      const { rows: exportRows, totalMatching, exportedCount, capped } =
        result.data;

      let targetRows = exportRows;
      if (exportSelectedOnly) {
        if (allFilteredSelected) {
          targetRows = exportRows.filter((row) => isFpsRowSelectable(row));
        } else {
          targetRows = exportRows.filter((row) =>
            selectedIds.has(row.requestId),
          );
        }
      }

      if (targetRows.length === 0) {
        toast.warning("沒有可導出的提現紀錄！");
        return;
      }

      const headers =
        "提現單號,訂單號,用戶名稱,提現金額(HK$),FPS收款人,FPS ID,提交時間,狀態,管理員FPS參考,銷帳時間\n";
      const rows = targetRows
        .map((row) =>
          [
            `"${row.requestId}"`,
            `"${row.orderNumber}"`,
            `"${row.sellerName}"`,
            row.amount,
            `"${row.fpsName ?? ""}"`,
            `"${row.fpsId}"`,
            `"${row.submittedAt}"`,
            formatFpsPayoutStatusLabel(row.status),
            `"${row.adminFpsReference ?? ""}"`,
            `"${row.paidAt ?? ""}"`,
          ].join(","),
        )
        .join("\n");

      const csvContent =
        "data:text/csv;charset=utf-8," + encodeURIComponent(headers + rows);
      const link = document.createElement("a");
      link.setAttribute("href", csvContent);
      link.setAttribute(
        "download",
        `HKCV_FPS_Payout_Export_${new Date().toISOString().split("T")[0]}.csv`,
      );
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      if (exportSelectedOnly) {
        toast.success(`已成功導出 ${targetRows.length} 筆 FPS Payout CSV 文件！`);
        return;
      }

      if (capped) {
        toast.success(
          `已導出 ${exportedCount} 筆（共 ${totalMatching} 筆符合篩選，已達單次上限 ${FPS_EXPORT_CAP}）`,
        );
        return;
      }

      toast.success(`已成功導出 ${targetRows.length} 筆 FPS Payout CSV 文件！`);
    } finally {
      setIsExportingCsv(false);
    }
  };

  const handleCompleteSubmit = async () => {
    if (!completeDialogRequestId) return;

    const reference = adminFpsReference.trim();
    if (!reference) {
      toast.error("請填寫 FPS 轉帳參考號");
      return;
    }

    setIsMutating(true);
    try {
      const result = await updateAdminPayoutRequestStatus({
        requestId: completeDialogRequestId,
        status: "completed",
        adminFpsReference: reference,
      });
      if (!result.success) {
        toast.error(result.error);
        return;
      }

      toast.success(
        `${formatRequestId(completeDialogRequestId)} 手動銷帳成功`,
      );
      setCompleteDialogRequestId(null);
      setAdminFpsReference("");
      if (allFilteredSelected) {
        setAllFilteredSelected(false);
      } else {
        setSelectedIds((prev) => {
          if (!prev.has(completeDialogRequestId)) return prev;
          const next = new Set(prev);
          next.delete(completeDialogRequestId);
          return next;
        });
      }
      fetchPage({});
    } finally {
      setIsMutating(false);
    }
  };

  const handleStatusUpdate = async (
    requestId: string,
    status: "failed",
  ) => {
    setIsMutating(true);
    try {
      const result = await updateAdminPayoutRequestStatus({ requestId, status });
      if (!result.success) {
        toast.error(result.error);
        return;
      }

      const actionLabel = "已標記失敗";
      toast.success(`${formatRequestId(requestId)} ${actionLabel}`);
      if (allFilteredSelected) {
        setAllFilteredSelected(false);
      } else {
        setSelectedIds((prev) => {
          if (!prev.has(requestId)) return prev;
          const next = new Set(prev);
          next.delete(requestId);
          return next;
        });
      }
      fetchPage({});
    } finally {
      setIsMutating(false);
    }
  };

  const handleBatchComplete = async () => {
    if (!hasSelection) return;

    const confirmed = window.confirm(
      "批量銷帳不記錄 FPS 參考號，確認繼續？",
    );
    if (!confirmed) return;

    setIsMutating(true);
    try {
      let requestIds: string[];
      if (allFilteredSelected) {
        const exportResult = await listAdminPayoutRequestsForExport({
          search: debouncedSearch || undefined,
          statusFilter,
          sort,
        });
        if (!exportResult.success) {
          toast.error(exportResult.error);
          return;
        }
        requestIds = getSelectableFpsRequestIds(exportResult.data.rows);
      } else {
        requestIds = [...selectedIds];
      }

      if (requestIds.length === 0) {
        toast.warning("沒有可銷帳的提現單");
        return;
      }

      const result = await batchCompleteAdminPayoutRequests({
        requestIds,
      });

      if (!result.success) {
        toast.error(result.error);
        return;
      }

      toast.success(`已批量完成 ${result.completedCount} 筆提現單銷帳！`);
      resetSelection();
      fetchPage({});
    } finally {
      setIsMutating(false);
    }
  };

  const totalPages = pageData.totalPages;

  const selectableRowIds = useMemo(
    () => getSelectableFpsRequestIds(pageData.rows),
    [pageData.rows],
  );

  const selectableFilterTotal = useMemo(() => {
    if (statusFilter === "incomplete" || statusFilter === "all") {
      return pageData.statusCounts.incomplete;
    }
    return 0;
  }, [statusFilter, pageData.statusCounts.incomplete]);

  const selectedCount = allFilteredSelected
    ? selectableFilterTotal
    : selectedIds.size;

  const hasSelection = allFilteredSelected || selectedIds.size > 0;

  const displayError = loadError ?? fetchError;

  return (
    <div className="space-y-4">
      <BlockingLoadingOverlay
        open={isExportingCsv || isMutating}
        message={
          isExportingCsv ? "正在導出 FPS Payout CSV…" : "正在更新提現單狀態…"
        }
      />

      <Dialog
        open={completeDialogRequestId !== null}
        onOpenChange={(open) => {
          if (!open) {
            setCompleteDialogRequestId(null);
            setAdminFpsReference("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>FPS 銷帳確認</DialogTitle>
            <DialogDescription>
              請輸入銀行／轉數快轉帳參考號以完成銷帳。
            </DialogDescription>
          </DialogHeader>
          <input
            name="adminFpsReference"
            value={adminFpsReference}
            onChange={(event) => setAdminFpsReference(event.target.value)}
            placeholder="FPS 轉帳參考號"
          />
          <DialogFooter>
            <button
              type="button"
              onClick={() => {
                setCompleteDialogRequestId(null);
                setAdminFpsReference("");
              }}
            >
              取消
            </button>
            <button
              type="button"
              onClick={handleCompleteSubmit}
              disabled={isMutating || !adminFpsReference.trim()}
            >
              確認銷帳
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {displayError ? (
        <div className="rounded-lg border border-warning/30 bg-warning/10 px-3 py-2.5 font-sans text-[13px] text-warning">
          {displayError}
        </div>
      ) : null}

      <section
        className="space-y-2 border-b border-white/[0.08] pb-4"
        aria-label="FPS 提現篩選與操作"
      >
        <div className="relative">
          <Search
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-text-disabled"
            aria-hidden="true"
          />
          <Input
            type="search"
            placeholder="搜尋單號、用戶、FPS…"
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            className={FILTER_INPUT_CLASS}
          />
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
              options={FPS_SORT_OPTIONS}
              onChange={handleSortChange}
            />
          </div>
        </div>

        <div className="hidden items-center justify-between gap-2 md:flex">
          {selectableRowIds.length > 0 ? (
            <div className="flex items-center gap-2 text-[11px]">
              {hasSelection ? (
                <SelectionCountBadge
                  count={selectedCount}
                  onClear={clearSelection}
                  disabled={isExportingCsv || isMutating}
                />
              ) : null}
              {!allFilteredSelected && selectableRowIds.length > 0 ? (
                <button
                  type="button"
                  onClick={toggleSelectAll}
                  disabled={isExportingCsv || isMutating}
                  className="shrink-0 font-sans text-brand transition-colors hover:underline disabled:opacity-50"
                >
                  全選
                </button>
              ) : null}
              {hasSelection ? (
                <>
                  <button
                    type="button"
                    onClick={handleBatchComplete}
                    disabled={isExportingCsv || isMutating}
                    className={BTN_PRIMARY_SM_CLASS}
                  >
                    批量銷帳
                  </button>
                  <button
                    type="button"
                    onClick={() => handleExportCsv(true)}
                    disabled={isExportingCsv || isMutating}
                    className={`${BTN_OUTLINE_SM_CLASS} shrink-0 gap-1.5 text-brand`}
                  >
                    <Download className="size-3.5 shrink-0" aria-hidden="true" />
                    <span>導出記錄</span>
                  </button>
                </>
              ) : null}
            </div>
          ) : (
            <div />
          )}
          <SortSelect
            compact
            value={sort}
            options={FPS_SORT_OPTIONS}
            onChange={handleSortChange}
          />
        </div>
      </section>

      {pageData.rows.length === 0 ? (
        <p className="py-10 text-center font-sans text-[13px] text-text-secondary">
          沒有符合篩選條件的提現記錄。
        </p>
      ) : (
        <>
          <div className="md:hidden">
            {(selectedIds.size > 0 || selectableRowIds.length > 0) && (
              <div
                className="mb-2.5 flex items-center justify-between gap-2 px-1 min-h-8 text-[11px]"
              >
                {hasSelection ? (
                  <>
                    <div className="flex items-center gap-1.5 min-w-0">
                      <SelectionCountBadge
                        count={selectedCount}
                        onClear={clearSelection}
                        disabled={isExportingCsv || isMutating}
                      />
                      {!allFilteredSelected && selectableRowIds.length > 0 ? (
                        <button
                          type="button"
                          onClick={toggleSelectAll}
                          disabled={isExportingCsv || isMutating}
                          className="shrink-0 font-sans text-[10px] text-brand transition-colors hover:underline disabled:opacity-50"
                        >
                          全選
                        </button>
                      ) : null}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={handleBatchComplete}
                        disabled={isExportingCsv || isMutating}
                        className={`${BTN_PRIMARY_SM_CLASS} px-2.5`}
                      >
                        銷帳
                      </button>
                      <button
                        type="button"
                        onClick={() => handleExportCsv(true)}
                        disabled={isExportingCsv || isMutating}
                        className={`${BTN_OUTLINE_SM_CLASS} shrink-0 gap-1 text-brand`}
                      >
                        <Download
                          className="size-3.5 shrink-0"
                          aria-hidden="true"
                        />
                        <span>導出記錄</span>
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="flex items-center gap-2 min-w-0">
                    <button
                      type="button"
                      onClick={toggleSelectAll}
                      disabled={isExportingCsv || isMutating}
                      className="shrink-0 font-sans text-brand transition-colors hover:underline disabled:opacity-50"
                    >
                      全選
                    </button>
                  </div>
                )}
              </div>
            )}
            <div
              className={`space-y-2 ${isPending ? "opacity-60" : ""}`}
            >
            {pageData.rows.map((row) => {
              const blockedForComplete = isFpsPayoutBlockedForComplete({
                status: row.status,
                fpsId: row.fpsId,
                fpsName: row.fpsName,
              });
              const canSelect = isFpsRowSelectable(row);
              const isSelected =
                canSelect &&
                (allFilteredSelected || selectedIds.has(row.requestId));

              return (
                <FpsPayoutMobileCard
                  key={row.requestId}
                  row={row}
                  isSelected={isSelected}
                  canSelect={canSelect}
                  isMutating={isMutating}
                  blockedForComplete={blockedForComplete}
                  onToggleSelect={() => toggleSelectRow(row.requestId)}
                  onComplete={() => {
                    setCompleteDialogRequestId(row.requestId);
                    setAdminFpsReference("");
                  }}
                  onReject={() => handleStatusUpdate(row.requestId, "failed")}
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
                    (selectableRowIds.length > 0 &&
                      selectableRowIds.every((id) => selectedIds.has(id)))
                  }
                  onChange={toggleSelectAll}
                  disabled={selectableRowIds.length === 0}
                  className="rounded border-white/20 accent-brand cursor-pointer disabled:opacity-40"
                />
              </TableHead>
              <TableHead className="h-9 font-mono text-[11px] text-text-disabled">
                提現單號
              </TableHead>
              <TableHead className="h-9 font-mono text-[11px] text-text-disabled">
                訂單號
              </TableHead>
              <TableHead className="h-9 font-sans text-[11px] text-text-disabled">
                用戶名稱
              </TableHead>
              <TableHead className="h-9 text-right font-mono text-[11px] text-text-disabled">
                提現金額
              </TableHead>
              <TableHead className="h-9 font-mono text-[11px] text-text-disabled">
                FPS 收款人
              </TableHead>
              <TableHead className="h-9 font-mono text-[11px] text-text-disabled">
                FPS ID
              </TableHead>
              <TableHead className="h-9 font-mono text-[11px] text-text-disabled">
                提交時間
              </TableHead>
              <TableHead className="h-9 text-center font-sans text-[11px] text-text-disabled">
                狀態
              </TableHead>
              <TableHead className="h-9 font-mono text-[11px] text-text-disabled">
                FPS 參考
              </TableHead>
              <TableHead className="h-9 min-w-[5.5rem] text-right font-sans text-[11px] text-text-disabled">
                操作
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pageData.rows.map((row, rowIndex) => {
              const blockedForComplete = isFpsPayoutBlockedForComplete({
                status: row.status,
                fpsId: row.fpsId,
                fpsName: row.fpsName,
              });
              const canSelect = isFpsRowSelectable(row);
              const isSelected =
                canSelect &&
                (allFilteredSelected || selectedIds.has(row.requestId));
              const canAct = isFpsPayoutIncomplete(row.status);

              return (
                <TableRow
                  key={row.requestId}
                  className={`border-white/[0.06] transition-colors hover:bg-brand/10 ${
                    rowIndex % 2 === 0 ? "bg-bg-card/25" : "bg-white/[0.02]"
                  } ${isSelected ? "bg-brand/10" : ""}`}
                >
                  <TableCell className="w-10 py-2.5 text-center">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      disabled={!canSelect}
                      onChange={() => toggleSelectRow(row.requestId)}
                      className="rounded border-[rgba(237,232,224,0.2)] bg-bg-card accent-brand cursor-pointer disabled:opacity-40"
                    />
                  </TableCell>
                  <TableCell className="font-mono text-[11px] text-text-disabled py-3 whitespace-nowrap">
                    {formatRequestId(row.requestId)}
                  </TableCell>
                  <TableCell className="font-mono text-[11px] text-text-disabled py-3 whitespace-nowrap">
                    <Link
                      href={`/profile/user/orderDetail/${row.orderNumber}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-brand hover:underline"
                    >
                      {row.orderNumber}
                    </Link>
                  </TableCell>
                  <TableCell className="font-sans font-semibold text-[13px] text-text-primary py-3 whitespace-nowrap">
                    <Link
                      href={`/profile/${row.sellerId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-brand hover:underline"
                    >
                      {row.sellerName}
                    </Link>
                  </TableCell>
                  <TableCell className="font-mono font-bold text-[13px] text-text-primary text-right py-3 whitespace-nowrap">
                    <div>{formatAdminHkd(row.amount)}</div>
                    {row.fpsTransferFeeHkd > 0 ? (
                      <div className="font-mono text-[10px] font-normal text-text-disabled">
                        毛額 {formatAdminHkd(row.grossPayoutHkd)} · 手續費{" "}
                        {formatAdminHkd(row.fpsTransferFeeHkd)}
                      </div>
                    ) : null}
                  </TableCell>
                  <TableCell className="font-sans text-[12px] text-text-primary py-3 whitespace-nowrap">
                    {row.fpsName ?? "—"}
                  </TableCell>
                  <TableCell className="font-mono text-[12px] text-brand font-bold py-3 whitespace-nowrap">
                    {row.fpsId}
                  </TableCell>
                  <TableCell className="font-mono text-[11px] text-text-disabled py-3 whitespace-nowrap">
                    {row.submittedAt}
                  </TableCell>
                  <TableCell className="text-center py-3 whitespace-nowrap">
                    <span
                      className={`inline-block font-mono text-[9px] px-2 py-0.5 rounded border ${getFpsPayoutStatusBadgeClass(row.status)}`}
                    >
                      {formatFpsPayoutStatusLabel(row.status)}
                    </span>
                    {blockedForComplete ? (
                      <div className="mt-1 font-sans text-[10px] text-text-disabled">
                        待賣家補 FPS
                      </div>
                    ) : null}
                  </TableCell>
                  <TableCell className="font-mono text-[11px] text-text-disabled py-3 whitespace-nowrap">
                    {row.adminFpsReference ?? "—"}
                  </TableCell>
                  <TableCell className="text-right py-2.5 whitespace-nowrap">
                    <div className="flex justify-end items-center gap-1.5">
                      <a
                        href={`/profile/user/orderDetail/${row.orderNumber}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`${BTN_OUTLINE_SM_CLASS} inline-flex h-8 items-center px-2.5 text-brand`}
                      >
                        查看訂單
                      </a>
                      {canAct ? (
                        <>
                          {!blockedForComplete ? (
                            <button
                              type="button"
                              onClick={() => {
                                setCompleteDialogRequestId(row.requestId);
                                setAdminFpsReference("");
                              }}
                              disabled={isMutating}
                              className={BTN_PRIMARY_SM_CLASS}
                            >
                              銷帳
                            </button>
                          ) : null}
                          <button
                            type="button"
                            onClick={() =>
                              handleStatusUpdate(row.requestId, "failed")
                            }
                            disabled={isMutating}
                            className={`${BTN_OUTLINE_SM_CLASS} border-warning/30 text-warning hover:border-warning/40 hover:bg-warning/10 hover:text-warning`}
                          >
                            駁回
                          </button>
                        </>
                      ) : null}
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
              itemsPerPage={pageData.pageSize}
              itemLabel="筆資料"
              enableScroll={false}
            />
          ) : null}
        </>
      )}
    </div>
  );
}
