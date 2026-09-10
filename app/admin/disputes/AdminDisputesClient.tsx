"use client";

import { useCallback, useEffect, useMemo, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search, Scale } from "lucide-react";
import { searchAdminModerationCases } from "@/app/actions/admin-moderation";
import { FILTER_CHIP_SM_CLASS, FILTER_INPUT_CLASS } from "@/app/admin/campaigns/campaigns-ui";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  categoryBadgeClasses,
  deriveSeverityBand,
  formatCategoryLabel,
  formatModerationDateTime,
  moderationStatusBadgeClasses,
  moderationStatusLabel,
  severityBadgeClasses,
  severityLabel,
} from "@/lib/moderation/admin-case-presenters";
import type {
  AdminModerationCaseRow,
  AdminModerationSearchResult,
  AdminModerationSearchStatus,
} from "@/lib/moderation/types";

const BTN_OUTLINE_CLASS =
  "border-[rgba(237,232,224,0.12)] bg-transparent hover:border-brand/30 hover:bg-brand/10 hover:text-brand text-text-primary text-[12px] active:scale-[0.98]";

type TabValue = "all" | "pending" | "completed";

type AdminDisputesClientProps = {
  initialData: AdminModerationSearchResult;
  initialStatus: AdminModerationSearchStatus;
  loadError: string | null;
};

function tabToStatus(tab: TabValue): AdminModerationSearchStatus {
  if (tab === "pending") {
    return "pending";
  }
  if (tab === "completed") {
    return "completed";
  }
  return "all";
}

function statusParamToTab(statusParam: string | null): TabValue {
  if (statusParam === "pending") {
    return "pending";
  }
  if (statusParam === "completed" || statusParam === "resolved") {
    return "completed";
  }
  return "all";
}

function AdminDisputesContent({
  initialData,
  initialStatus,
  loadError,
  statusParam,
}: AdminDisputesClientProps & { statusParam: string | null }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [activeTab, setActiveTab] = useState<TabValue>(
    statusParamToTab(statusParam ?? (initialStatus === "all" ? null : initialStatus)),
  );
  const [currentPage, setCurrentPage] = useState(1);
  const [rows, setRows] = useState<AdminModerationCaseRow[]>(initialData.rows);
  const [total, setTotal] = useState(initialData.total);
  const [pendingCount, setPendingCount] = useState(initialData.pendingCount);
  const [error, setError] = useState<string | null>(loadError);
  const [isLoading, setIsLoading] = useState(false);
  const pageSize = 10;

  const completedCount = useMemo(
    () => Math.max(total - pendingCount, 0),
    [pendingCount, total],
  );

  const totalPages = Math.max(Math.ceil(total / pageSize), 1);

  const tabChipOptions = useMemo(
    () => [
      { key: "all" as TabValue, label: "全部", count: total },
      { key: "pending" as TabValue, label: "待處理", count: pendingCount },
      { key: "completed" as TabValue, label: "已完成", count: completedCount },
    ],
    [completedCount, pendingCount, total],
  );

  const fetchCases = useCallback(
    async (params: {
      tab: TabValue;
      page: number;
      search: string;
    }) => {
      setIsLoading(true);
      setError(null);

      const result = await searchAdminModerationCases({
        status: tabToStatus(params.tab),
        page: params.page,
        pageSize,
        search: params.search || undefined,
      });

      if (!result.success) {
        setError(result.error);
        setIsLoading(false);
        return;
      }

      setRows(result.data.rows);
      setTotal(result.data.total);
      setPendingCount(result.data.pendingCount);
      setIsLoading(false);
    },
    [pageSize],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void fetchCases({ tab: activeTab, page: currentPage, search: query });
    }, query ? 300 : 0);

    return () => window.clearTimeout(timer);
  }, [activeTab, currentPage, query, fetchCases]);

  const handleRowClick = (id: string) => {
    router.push(`/admin/disputes/${id}`);
  };

  return (
    <div className="space-y-5 pb-8">
      <p className="font-sans text-[13px] text-text-secondary">
        全平台舉報、糾紛投訴、Stripe 支付爭議聯合仲裁管控面板
      </p>

      {error ? (
        <div className="rounded-xl border border-error/30 bg-error/10 px-4 py-3 font-sans text-[13px] text-error">
          {error}
        </div>
      ) : null}

      <div className="space-y-4 border-b border-white/[0.08] pb-5">
        <div className="relative w-full">
          <Search
            className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-text-disabled"
            aria-hidden="true"
          />
          <Input
            type="text"
            placeholder="搜尋案件單號、被舉報人、舉報人、類別..."
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setCurrentPage(1);
            }}
            className={FILTER_INPUT_CLASS}
          />
        </div>

        <FilterChipRow
          label="狀態"
          options={tabChipOptions}
          active={activeTab}
          onSelect={(key) => {
            setActiveTab(key);
            setCurrentPage(1);
          }}
        />
      </div>

      {rows.length === 0 && !isLoading ? (
        <div className="py-16 text-center">
          <div className="flex flex-col items-center gap-3 text-text-secondary">
            <Scale className="size-8 text-brand/60" aria-hidden="true" />
            <p className="font-sans text-[14px] text-text-primary">
              目前沒有符合篩選條件的爭議案件
            </p>
            <p className="font-sans text-[12px] text-text-disabled">
              請嘗試清除搜尋字詞或切換其他狀態分頁
            </p>
            {(query || activeTab !== "all") && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setQuery("");
                  setActiveTab("all");
                  setCurrentPage(1);
                }}
                className={BTN_OUTLINE_CLASS}
              >
                清除篩選條件
              </Button>
            )}
          </div>
        </div>
      ) : (
        <>
          <div className={`md:hidden divide-y divide-white/[0.06] ${isLoading ? "opacity-60" : ""}`}>
            {rows.map((c) => (
              <ModerationCaseMobileCard
                key={c.id}
                caseRow={c}
                onOpen={handleRowClick}
              />
            ))}
          </div>

          <div
            className={`hidden overflow-x-auto rounded-lg border border-white/[0.08] md:block ${isLoading ? "opacity-60" : ""}`}
          >
            <Table>
              <TableHeader className="border-b border-white/[0.08] bg-bg-card/30">
                <TableRow className="border-transparent hover:bg-transparent">
                  <TableHead className="h-9 px-3 font-mono text-[11px] font-medium uppercase tracking-wide text-text-disabled">
                    案件單號
                  </TableHead>
                  <TableHead className="h-9 px-3 font-sans text-[11px] font-medium uppercase tracking-wide text-text-disabled">
                    被舉報用戶
                  </TableHead>
                  <TableHead className="h-9 px-3 font-sans text-[11px] font-medium uppercase tracking-wide text-text-disabled">
                    申訴買家/舉報人
                  </TableHead>
                  <TableHead className="h-9 px-3 font-sans text-[11px] font-medium uppercase tracking-wide text-text-disabled">
                    舉報類別
                  </TableHead>
                  <TableHead className="h-9 px-3 font-sans text-[11px] font-medium uppercase tracking-wide text-text-disabled">
                    嚴重程度
                  </TableHead>
                  <TableHead className="h-9 px-3 font-mono text-[11px] font-medium uppercase tracking-wide text-text-disabled">
                    風控分數
                  </TableHead>
                  <TableHead className="hidden h-9 px-3 font-sans text-[11px] font-medium uppercase tracking-wide text-text-disabled lg:table-cell">
                    詳細舉報原因
                  </TableHead>
                  <TableHead className="h-9 px-3 font-mono text-[11px] font-medium uppercase tracking-wide text-text-disabled">
                    提交時間
                  </TableHead>
                  <TableHead className="h-9 px-3 font-sans text-[11px] font-medium uppercase tracking-wide text-text-disabled">
                    案件狀態
                  </TableHead>
                  <TableHead className="h-9 min-w-[6.5rem] px-3 text-right font-sans text-[11px] font-medium uppercase tracking-wide text-text-disabled" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((c, rowIndex) => {
                  const severity = deriveSeverityBand(c.finalScore);
                  const reporterLabel =
                    c.reporterPreview.extraCount > 0
                      ? `${c.reporterPreview.displayName} (+${c.reporterPreview.extraCount})`
                      : c.reporterPreview.displayName;

                  return (
                    <TableRow
                      key={c.id}
                      className={`cursor-pointer border-white/[0.06] transition-colors hover:bg-brand/10 ${
                        rowIndex % 2 === 0 ? "bg-bg-card/25" : "bg-white/[0.02]"
                      }`}
                      onClick={() => handleRowClick(c.id)}
                    >
                      <TableCell className="px-3 py-2.5">
                        <div className="flex flex-col gap-1">
                          <span className="font-mono text-[12px] font-medium text-text-primary">
                            {c.caseNumber}
                          </span>
                          {(c.status === "open" || c.status === "reviewing") &&
                          (c.subjectPriorUpheldCount ?? 0) >= 1 ? (
                            <Badge
                              variant="outline"
                              className="w-fit border-warning/20 bg-warning/10 text-[10px] text-warning"
                            >
                              曾有違規
                            </Badge>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell className="px-3 py-2.5">
                        <div className="flex min-w-[8rem] flex-col">
                          <span className="font-sans text-[13px] text-text-primary">
                            {c.subject.displayName ?? "未知用戶"}
                          </span>
                          <span className="font-mono text-[10px] text-text-disabled">
                            @{c.subject.username ?? "—"}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="px-3 py-2.5">
                        <span className="font-sans text-[13px] text-text-primary">
                          {reporterLabel}
                        </span>
                      </TableCell>
                      <TableCell className="px-3 py-2.5">
                        <Badge
                          variant="outline"
                          className={categoryBadgeClasses(c.primaryCategory)}
                        >
                          {formatCategoryLabel(c.primaryCategory)}
                        </Badge>
                      </TableCell>
                      <TableCell className="px-3 py-2.5">
                        <Badge
                          variant="outline"
                          className={severityBadgeClasses(severity)}
                        >
                          {severityLabel(severity)}
                        </Badge>
                      </TableCell>
                      <TableCell className="px-3 py-2.5">
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger>
                              <span className="font-mono text-[12px] font-semibold text-text-primary">
                                {c.finalScore ?? 0}
                              </span>
                            </TooltipTrigger>
                            <TooltipContent className="border border-white/10 bg-bg-elevated text-text-primary">
                              <p className="font-sans text-[12px]">
                                自動分數 {c.autoScore} + 管理員調整{" "}
                                {c.adminAdjustment}
                              </p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </TableCell>
                      <TableCell className="hidden px-3 py-2.5 lg:table-cell">
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger>
                              <p className="max-w-[240px] cursor-help truncate font-sans text-[12px] text-text-secondary">
                                {c.previewDetails ?? "—"}
                              </p>
                            </TooltipTrigger>
                            <TooltipContent
                              side="top"
                              align="start"
                              className="max-w-sm border border-white/10 bg-bg-elevated text-text-primary"
                            >
                              <p className="font-sans text-[12px] leading-relaxed">
                                {c.previewDetails ?? "—"}
                              </p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </TableCell>
                      <TableCell className="px-3 py-2.5">
                        <span className="font-mono text-[11px] text-text-secondary">
                          {formatModerationDateTime(c.createdAt)}
                        </span>
                      </TableCell>
                      <TableCell className="px-3 py-2.5">
                        <Badge
                          variant="outline"
                          className={moderationStatusBadgeClasses(c.status)}
                        >
                          {moderationStatusLabel(c.status)}
                        </Badge>
                      </TableCell>
                      <TableCell className="px-3 py-2.5 text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRowClick(c.id);
                          }}
                          className={`${BTN_OUTLINE_CLASS} h-8`}
                        >
                          查看詳情
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </>
      )}

      {rows.length > 0 ? (
        <div className="flex flex-col gap-3 font-mono text-[12px] text-text-secondary sm:flex-row sm:items-center sm:justify-between">
          <span>
            顯示第 {(currentPage - 1) * pageSize + 1}–
            {Math.min(currentPage * pageSize, total)} 筆 · 共 {total} 筆
            {isLoading ? "（更新中…）" : ""}
          </span>
          <div className="flex gap-2 self-end sm:self-auto">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={currentPage === 1 || isLoading}
              onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
              className={BTN_OUTLINE_CLASS}
            >
              上一頁
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={currentPage === totalPages || isLoading}
              onClick={() =>
                setCurrentPage((prev) => Math.min(prev + 1, totalPages))
              }
              className={BTN_OUTLINE_CLASS}
            >
              下一頁
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function AdminDisputesClientWithSearchParams(props: AdminDisputesClientProps) {
  const searchParams = useSearchParams();
  const statusParam = searchParams.get("status");
  return (
    <AdminDisputesContent
      {...props}
      key={statusParam || "default"}
      statusParam={statusParam}
    />
  );
}

export function AdminDisputesClient(props: AdminDisputesClientProps) {
  return (
    <Suspense
      fallback={
        <div className="p-4 font-mono text-xs text-text-secondary">
          載入爭議資料中...
        </div>
      }
    >
      <AdminDisputesClientWithSearchParams {...props} />
    </Suspense>
  );
}

function ModerationCaseMobileCard({
  caseRow,
  onOpen,
}: {
  caseRow: AdminModerationCaseRow;
  onOpen: (id: string) => void;
}) {
  const severity = deriveSeverityBand(caseRow.finalScore);
  const reporterLabel =
    caseRow.reporterPreview.extraCount > 0
      ? `${caseRow.reporterPreview.displayName} (+${caseRow.reporterPreview.extraCount})`
      : caseRow.reporterPreview.displayName;

  return (
    <article
      role="button"
      tabIndex={0}
      onClick={() => onOpen(caseRow.id)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpen(caseRow.id);
        }
      }}
      className="space-y-2 px-1 py-3 transition-colors active:bg-brand/5"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-mono text-[12px] font-semibold text-text-primary">
            {caseRow.caseNumber}
          </p>
          <p className="mt-0.5 truncate font-sans text-[13px] text-text-primary">
            {caseRow.subject.displayName ?? "未知用戶"}
          </p>
          <p className="truncate font-mono text-[10px] text-text-disabled">
            @{caseRow.subject.username ?? "—"}
          </p>
        </div>
        <Badge
          variant="outline"
          className={`shrink-0 ${moderationStatusBadgeClasses(caseRow.status)}`}
        >
          {moderationStatusLabel(caseRow.status)}
        </Badge>
      </div>

      <div className="flex flex-wrap items-center gap-1">
        <Badge
          variant="outline"
          className={categoryBadgeClasses(caseRow.primaryCategory)}
        >
          {formatCategoryLabel(caseRow.primaryCategory)}
        </Badge>
        <Badge variant="outline" className={severityBadgeClasses(severity)}>
          {severityLabel(severity)}
        </Badge>
        {(caseRow.status === "open" || caseRow.status === "reviewing") &&
        (caseRow.subjectPriorUpheldCount ?? 0) >= 1 ? (
          <Badge
            variant="outline"
            className="border-warning/20 bg-warning/10 text-[10px] text-warning"
          >
            曾有違規
          </Badge>
        ) : null}
      </div>

      <dl className="grid grid-cols-1 gap-1 font-mono text-[10px]">
        <div className="flex min-w-0 gap-2">
          <dt className="shrink-0 text-text-disabled">舉報人</dt>
          <dd className="truncate text-text-secondary">{reporterLabel}</dd>
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-1">
          <div className="flex gap-1.5">
            <dt className="text-text-disabled">分數</dt>
            <dd className="font-medium text-text-primary">
              {caseRow.finalScore ?? 0}
            </dd>
          </div>
          <div className="flex gap-1.5">
            <dt className="text-text-disabled">提交</dt>
            <dd className="text-text-disabled">
              {formatModerationDateTime(caseRow.createdAt)}
            </dd>
          </div>
        </div>
      </dl>

      {caseRow.previewDetails ? (
        <p className="line-clamp-2 font-sans text-[11px] leading-relaxed text-text-secondary">
          {caseRow.previewDetails}
        </p>
      ) : null}

      <span className="font-sans text-[11px] font-medium text-brand">
        查看詳情 →
      </span>
    </article>
  );
}

function FilterChipRow<K extends string>({
  label,
  options,
  active,
  onSelect,
}: {
  label: string;
  options: { key: K; label: string; count: number }[];
  active: K;
  onSelect: (key: K) => void;
}) {
  return (
    <div className="space-y-2">
      <span className="font-sans text-[11px] font-medium uppercase tracking-wide text-text-secondary">
        {label}
      </span>
      <div className="flex flex-wrap items-center gap-1">
        {options.map(({ key, label: optionLabel, count }) => {
          const selected = active === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => onSelect(key)}
              className={`${FILTER_CHIP_SM_CLASS(selected)} ${
                selected ? "" : "border-transparent"
              }`}
            >
              {optionLabel} ({count})
            </button>
          );
        })}
      </div>
    </div>
  );
}
