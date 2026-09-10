"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Search, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import {
  getAdminGradingTabCounts,
  searchAdminGradingOrders,
  type AdminGradingOrderKind,
  type AdminGradingQueueRow,
  type AdminGradingTab,
  type AdminGradingTabCounts,
} from "@/app/actions/admin-grading";
import {
  BTN_OUTLINE_SM_CLASS,
  FILTER_INPUT_CLASS,
} from "@/app/admin/campaigns/campaigns-ui";
import {
  FilterChipRow,
  formatDateTime,
  formatParty,
  formatProductName,
  GradingQueueMobileCard,
  ORDER_KIND_LABELS,
  refundStatusBadge,
  TAB_LABELS,
} from "@/app/admin/grading/admin-grading-workbench-ui";
import { stashAdminGradingDetailRow } from "@/lib/admin-grading/detail-cache";
import { Pagination } from "@/app/components/ui/Pagination";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type OrderKindFilter = "all" | AdminGradingOrderKind;

const PAGE_SIZE = 20;

type AdminGradingClientProps = {
  initialRows: AdminGradingQueueRow[];
  initialTotal: number;
  initialTabCounts: AdminGradingTabCounts;
  loadError: string | null;
  initialTab?: AdminGradingTab;
};

export function AdminGradingClient({
  initialRows,
  initialTotal,
  initialTabCounts,
  loadError,
  initialTab = "awaiting_intake",
}: AdminGradingClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [tab, setTab] = useState<AdminGradingTab>(initialTab);
  const [orderKind, setOrderKind] = useState<OrderKindFilter>("all");
  const [keyword, setKeyword] = useState("");
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState(initialRows);
  const [total, setTotal] = useState(initialTotal);
  const [tabCounts, setTabCounts] =
    useState<AdminGradingTabCounts>(initialTabCounts);

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(total / PAGE_SIZE)),
    [total],
  );

  const tabChipOptions = useMemo(
    () =>
      (Object.keys(TAB_LABELS) as AdminGradingTab[]).map((key) => ({
        key,
        label: TAB_LABELS[key],
        count: tabCounts[key],
      })),
    [tabCounts],
  );

  const fetchTabCounts = useCallback(
    (filters: { orderKind: OrderKindFilter; keyword: string }) => {
      startTransition(async () => {
        const result = await getAdminGradingTabCounts({
          orderKind: filters.orderKind,
          keyword: filters.keyword,
        });
        if (!result.success) {
          return;
        }
        setTabCounts(result.data);
      });
    },
    [startTransition],
  );

  const fetchQueue = useCallback(
    (params: {
      tab: AdminGradingTab;
      orderKind: OrderKindFilter;
      keyword: string;
      page: number;
    }) => {
      startTransition(async () => {
        const result = await searchAdminGradingOrders({
          tab: params.tab,
          orderKind: params.orderKind,
          keyword: params.keyword,
          page: params.page,
          pageSize: PAGE_SIZE,
        });

        if (!result.success) {
          toast.error(result.error);
          return;
        }

        setRows(result.data.rows);
        setTotal(result.data.total);
        setPage(result.data.page);
        setTabCounts((prev) => ({
          ...prev,
          [params.tab]: result.data.total,
        }));
      });
    },
    [startTransition],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      fetchTabCounts({ orderKind, keyword });
    }, keyword ? 300 : 0);

    return () => window.clearTimeout(timer);
  }, [orderKind, keyword, fetchTabCounts]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      fetchQueue({ tab, orderKind, keyword, page: 1 });
      setPage(1);
    }, keyword ? 300 : 0);

    return () => window.clearTimeout(timer);
  }, [tab, orderKind, keyword, fetchQueue]);

  const refreshQueue = (nextPage = page, refreshCounts = false) => {
    fetchQueue({ tab, orderKind, keyword, page: nextPage });
    if (refreshCounts) {
      fetchTabCounts({ orderKind, keyword });
    }
  };

  const openDetail = (row: AdminGradingQueueRow) => {
    stashAdminGradingDetailRow(row);
    router.push(
      `/admin/grading/${row.order_kind}/${row.order_id}?tab=${tab}`,
    );
  };

  return (
    <div className="space-y-4 pb-8">
      {loadError ? (
        <div className="rounded-lg border border-error/30 bg-error/10 px-3 py-2.5 font-sans text-[13px] text-error">
          {loadError}
        </div>
      ) : null}

      <div className="space-y-3 border-b border-white/[0.08] pb-4">
        <div className="flex items-center gap-2">
          <div className="relative min-w-0 flex-1">
            <Search
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-text-disabled"
              aria-hidden="true"
            />
            <Input
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              placeholder="搜尋訂單、買家、物流…"
              className={FILTER_INPUT_CLASS}
            />
          </div>

          <Select
            value={orderKind}
            onValueChange={(value) => {
              setOrderKind(value as OrderKindFilter);
              setPage(1);
            }}
          >
            <SelectTrigger
              aria-label="訂單來源"
              className="h-9 min-h-9 w-[9.5rem] shrink-0 rounded-lg border border-white/10 bg-transparent px-3 font-sans text-[12px] text-text-primary transition-colors hover:border-brand/30 hover:bg-brand/10 focus-visible:border-brand/40 focus-visible:ring-0"
            >
              <SelectValue placeholder="全部來源">
                {ORDER_KIND_LABELS[orderKind]}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(ORDER_KIND_LABELS) as OrderKindFilter[]).map(
                (key) => (
                  <SelectItem key={key} value={key}>
                    {ORDER_KIND_LABELS[key]}
                  </SelectItem>
                ),
              )}
            </SelectContent>
          </Select>
        </div>

        <FilterChipRow
          options={tabChipOptions}
          active={tab}
          onSelect={(key) => {
            setTab(key);
            setPage(1);
          }}
        />
      </div>

      {rows.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-12 text-center text-text-secondary">
          <ShieldCheck className="size-8 text-brand/60" aria-hidden="true" />
          <p className="font-sans text-[14px] text-text-primary">
            此分頁暫無鑑定訂單
          </p>
          <p className="font-sans text-[12px] text-text-disabled">
            切換佇列或調整篩選條件
          </p>
        </div>
      ) : (
        <>
          <div className="divide-y divide-white/[0.06] md:hidden">
            {rows.map((row) => (
              <GradingQueueMobileCard
                key={`${row.order_kind}-${row.order_id}`}
                row={row}
                onOpen={() => openDetail(row)}
              />
            ))}
          </div>

          <div className="hidden overflow-x-auto rounded-lg border border-white/[0.08] md:block">
            <Table>
              <TableHeader className="border-b border-white/[0.08] bg-bg-card/30">
                <TableRow className="border-transparent hover:bg-transparent">
                  <TableHead className="h-9 font-sans text-[11px] text-text-disabled">
                    訂單號
                  </TableHead>
                  <TableHead className="h-9 font-sans text-[11px] text-text-disabled">
                    來源
                  </TableHead>
                  <TableHead className="h-9 font-sans text-[11px] text-text-disabled">
                    買家
                  </TableHead>
                  <TableHead className="h-9 font-sans text-[11px] text-text-disabled">
                    賣方
                  </TableHead>
                  <TableHead className="h-9 font-sans text-[11px] text-text-disabled">
                    商品
                  </TableHead>
                  <TableHead className="h-9 font-mono text-[11px] text-text-disabled">
                    入庫
                  </TableHead>
                  <TableHead className="hidden h-9 font-mono text-[11px] text-text-disabled lg:table-cell">
                    出庫
                  </TableHead>
                  <TableHead className="hidden h-9 font-sans text-[11px] text-text-disabled lg:table-cell">
                    退款
                  </TableHead>
                  <TableHead className="hidden h-9 font-mono text-[11px] text-text-disabled xl:table-cell">
                    更新
                  </TableHead>
                  <TableHead className="h-9 w-[4.5rem]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => {
                  const refundBadge = refundStatusBadge(row);
                  return (
                    <TableRow
                      key={`${row.order_kind}-${row.order_id}`}
                      className="border-white/[0.06] transition-colors duration-200 even:bg-transparent odd:bg-bg-card/40 hover:bg-brand/10"
                    >
                      <TableCell className="py-2.5">
                        <span className="font-mono text-[12px] font-medium text-text-primary">
                          {row.order_number ?? row.order_id.slice(0, 8)}
                        </span>
                      </TableCell>
                      <TableCell className="py-2.5">
                        <Badge
                          variant="outline"
                          className={
                            row.order_kind === "member"
                              ? "border-brand/25 bg-brand/10 text-brand"
                              : "border-white/10 bg-bg-elevated text-text-secondary"
                          }
                        >
                          {row.order_kind === "member" ? "C2C" : "B2C"}
                        </Badge>
                      </TableCell>
                      <TableCell className="max-w-[7rem] py-2.5">
                        <span className="truncate font-sans text-[12px] text-text-primary">
                          {row.buyer_display_name ?? row.buyer_username ?? "—"}
                        </span>
                      </TableCell>
                      <TableCell className="max-w-[7rem] py-2.5">
                        <span className="truncate font-sans text-[12px] text-text-primary">
                          {formatParty(row)}
                        </span>
                      </TableCell>
                      <TableCell className="max-w-[10rem] py-2.5">
                        <span className="truncate font-sans text-[12px] text-text-primary">
                          {formatProductName(row)}
                        </span>
                      </TableCell>
                      <TableCell className="py-2.5">
                        <span className="font-mono text-[11px] text-text-secondary">
                          {row.inbound_tracking_no ?? "—"}
                        </span>
                      </TableCell>
                      <TableCell className="hidden py-2.5 lg:table-cell">
                        <span className="font-mono text-[11px] text-text-secondary">
                          {row.outbound_tracking_no ?? "—"}
                        </span>
                      </TableCell>
                      <TableCell className="hidden py-2.5 lg:table-cell">
                        {refundBadge ? (
                          <Badge
                            variant="outline"
                            className={refundBadge.className}
                          >
                            {refundBadge.label}
                          </Badge>
                        ) : (
                          <span className="font-sans text-[11px] text-text-disabled">
                            —
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="hidden py-2.5 xl:table-cell">
                        <span className="font-mono text-[11px] text-text-secondary">
                          {formatDateTime(row.updated_at)}
                        </span>
                      </TableCell>
                      <TableCell className="py-2.5">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => openDetail(row)}
                          className={BTN_OUTLINE_SM_CLASS}
                        >
                          處理
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

      <Pagination
        currentPage={page}
        totalPages={totalPages}
        totalItems={total}
        itemsPerPage={PAGE_SIZE}
        itemLabel="筆"
        onPageChange={(nextPage) => refreshQueue(nextPage)}
        enableScroll={false}
        className={isPending ? "pointer-events-none opacity-60" : undefined}
      />

    </div>
  );
}
