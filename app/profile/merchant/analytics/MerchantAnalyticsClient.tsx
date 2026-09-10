"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { IoChevronBack } from "react-icons/io5";
import {
  ComposedChart,
  Area,
  Line,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
} from "recharts";
import { toast } from "sonner";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getMerchantProductAnalytics } from "@/app/actions/merchant-product-analytics";
import { Pagination } from "@/app/components/ui/Pagination";
import {
  MERCHANT_PERF_RANGES,
  RANGE_LABEL_MAP,
  SELECT_DISPLAY_MAP,
  isMerchantPerformanceRange,
} from "@/lib/dashboard/merchant-performance-ranges";
import type { MerchantPerformanceRange } from "@/lib/dashboard/merchant-performance-types";
import type { MerchantProductAnalytics } from "@/lib/dashboard/merchant-product-analytics-types";
import { cn } from "@/lib/utils";
import { SECTION_TITLE_CLASS } from "@/lib/ui/section-title-ui";
import { ChartLine } from "lucide-react";

const chartConfig = {
  totalSales: {
    label: "總銷售額 (HK$)",
    color: "#d4a574",
  },
  viewCount: {
    label: "瀏覽次數 (次)",
    color: "#00D2FF",
  },
  txCount: {
    label: "成交次數 (次)",
    color: "#10b981",
  },
  offerCount: {
    label: "叫價次數 (次)",
    color: "#a78bfa",
  },
} satisfies ChartConfig;

function formatCurrency(value: number): string {
  return `HK$ ${value.toLocaleString("zh-TW")}`;
}

function formatEventAt(value: string): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";

  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const min = String(date.getMinutes()).padStart(2, "0");

  return `${yyyy}-${mm}-${dd} ${hh}:${min}`;
}

function hasProductChartData(
  series: MerchantProductAnalytics["series"],
): boolean {
  return series.some(
    (point) =>
      point.totalSales > 0 ||
      point.viewCount > 0 ||
      point.txCount > 0 ||
      point.offerCount > 0,
  );
}

function ChartIntervalEmptyState({ rangeLabel }: { rangeLabel: string }) {
  return (
    <div
      className="flex flex-col items-center justify-center px-4 py-10 sm:py-12 text-center"
      role="status"
    >
      <div
        className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl border border-brand/20 bg-bg-page/60"
        aria-hidden
      >
        <ChartLine className="h-6 w-6 text-brand/70" strokeWidth={1.5} />
      </div>
      <p className="font-sans font-semibold text-[13px] text-text-primary">
        {rangeLabel}內暫無商品表現數據
      </p>
      <p className="mt-1 max-w-[280px] font-sans text-[12px] text-text-disabled leading-relaxed">
        瀏覽、叫價或成交後，趨勢圖將顯示於此
      </p>
      <p className="mt-3 font-mono text-[10px] text-text-disabled/80">
        可嘗試切換其他時間區間
      </p>
    </div>
  );
}

function ChartSeriesToggle({
  label,
  color,
  checked,
  onChange,
}: {
  label: string;
  color: string;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onChange}
      aria-pressed={checked}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border px-2 py-1 font-mono text-[10px] transition-colors focus:outline-none",
        checked
          ? "border-[rgba(237,232,224,0.12)] bg-bg-elevated/60 text-text-primary"
          : "border-transparent text-text-disabled opacity-55 hover:opacity-80",
      )}
    >
      <span
        className="w-2 h-2 rounded-full shrink-0"
        style={{
          backgroundColor: checked ? color : "transparent",
          border: `1.5px solid ${color}`,
          opacity: checked ? 1 : 0.45,
        }}
        aria-hidden
      />
      {label}
    </button>
  );
}

type MerchantAnalyticsClientProps = {
  productId: string;
  initialData: MerchantProductAnalytics | null;
  bootstrapError?: string;
};

export function MerchantAnalyticsClient({
  productId,
  initialData,
  bootstrapError,
}: MerchantAnalyticsClientProps) {
  const router = useRouter();
  const [range, setRange] = useState<MerchantPerformanceRange>(
    initialData?.timeRange ?? "7d",
  );
  const [analytics, setAnalytics] = useState<MerchantProductAnalytics | null>(
    initialData,
  );
  const [historyPage, setHistoryPage] = useState(1);
  const [isChartLoading, setIsChartLoading] = useState(false);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);
  const [displayArea, setDisplayArea] = useState(true);
  const [displayLine, setDisplayLine] = useState(true);
  const [displayBar, setDisplayBar] = useState(true);
  const [displayOffer, setDisplayOffer] = useState(true);

  const chartData = useMemo(
    () =>
      (analytics?.series ?? []).map((point) => ({
        time: point.label,
        totalSales: point.totalSales,
        viewCount: point.viewCount,
        txCount: point.txCount,
        offerCount: point.offerCount,
      })),
    [analytics?.series],
  );

  const fetchAnalytics = useCallback(
    async (
      nextRange: MerchantPerformanceRange,
      nextHistoryPage: number,
      options?: { chartOnly?: boolean },
    ) => {
      const result = await getMerchantProductAnalytics({
        productId,
        timeRange: nextRange,
        historyPage: nextHistoryPage,
      });

      if (!result.success) {
        throw new Error(result.error);
      }

      if (options?.chartOnly) {
        setAnalytics((current) =>
          current
            ? {
                ...current,
                series: result.data.series,
                timeRange: result.data.timeRange,
                history: result.data.history,
              }
            : result.data,
        );
      } else {
        setAnalytics(result.data);
      }
    },
    [productId],
  );

  const handleRangeChange = useCallback(
    async (nextRange: string | null) => {
      if (
        !nextRange ||
        !isMerchantPerformanceRange(nextRange) ||
        nextRange === range
      ) {
        return;
      }

      const previousRange = range;
      const previousPage = historyPage;
      setRange(nextRange);
      setHistoryPage(1);
      setIsChartLoading(true);

      try {
        await fetchAnalytics(nextRange, 1, { chartOnly: true });
      } catch (error) {
        setRange(previousRange);
        setHistoryPage(previousPage);
        toast.error(
          error instanceof Error ? error.message : "無法載入區間商品分析",
        );
      } finally {
        setIsChartLoading(false);
      }
    },
    [fetchAnalytics, historyPage, range],
  );

  const handleHistoryPageChange = useCallback(
    async (page: number) => {
      if (page === historyPage || page < 1) {
        return;
      }

      const previousPage = historyPage;
      setHistoryPage(page);
      setIsHistoryLoading(true);

      try {
        await fetchAnalytics(range, page);
      } catch (error) {
        setHistoryPage(previousPage);
        toast.error(
          error instanceof Error ? error.message : "無法載入交易歷史",
        );
      } finally {
        setIsHistoryLoading(false);
      }
    },
    [fetchAnalytics, historyPage, range],
  );

  const summary = analytics?.summary;
  const history = analytics?.history;
  const productName = analytics?.product.name ?? "未知商品";
  const currentRangeLabel = RANGE_LABEL_MAP[range] || "當前區間";
  const hasChartData = hasProductChartData(analytics?.series ?? []);

  return (
    <section
      aria-labelledby="analytics-heading"
      className="space-y-4 animate-fadeIn text-text-primary"
    >
      <div className="flex items-center gap-3 min-w-0">
        <button
          onClick={() => router.back()}
          className="shrink-0 p-1 -ml-1 text-text-secondary hover:text-brand flex items-center justify-center transition-colors duration-200 active:scale-95 cursor-pointer"
          aria-label="回上頁"
        >
          <IoChevronBack className="size-5" />
        </button>
        <h1
          id="analytics-heading"
          className="font-sans font-bold text-[15px] sm:text-[17px] text-brand tracking-tight truncate min-w-0"
        >
          {productName}
        </h1>
      </div>

      {bootstrapError ? (
        <div className="px-3.5 py-3 bg-[rgba(239,68,68,0.06)] border border-warning/25 rounded-xl">
          <p className="font-sans text-[13px] text-warning">{bootstrapError}</p>
        </div>
      ) : null}

      <section
        className="rounded-xl overflow-hidden bg-bg-card border border-[rgba(237,232,224,0.08)]"
        aria-label="商品價格摘要"
      >
        <div className="flex divide-x divide-[rgba(237,232,224,0.06)]">
          {[
            {
              label: "平均成交價",
              value: formatCurrency(summary?.avgSoldPrice ?? 0),
              valueClass: "text-[#d4a574]",
            },
            {
              label: "市場最低價",
              value: formatCurrency(summary?.marketLowestPrice ?? 0),
              valueClass: "text-text-primary",
            },
          ].map(({ label, value, valueClass }) => (
            <div key={label} className="flex-1 min-w-0 px-3 py-3 sm:px-4 sm:py-3.5">
              <p className="font-mono text-[9px] sm:text-[10px] text-text-secondary truncate leading-tight">
                {label}
              </p>
              <p
                className={cn(
                  "font-mono font-bold text-[13px] sm:text-[15px] leading-tight mt-1 truncate tabular-nums",
                  valueClass,
                )}
              >
                {value}
              </p>
            </div>
          ))}
        </div>
      </section>

      <div className="rounded-xl border border-[rgba(237,232,224,0.08)] bg-bg-card overflow-hidden">
        <div className="px-3.5 py-3 sm:px-4 border-b border-[rgba(237,232,224,0.06)] flex items-center justify-between gap-3 flex-wrap">
          <p className={SECTION_TITLE_CLASS}>
            商品表現
          </p>
          <div className="w-[110px] shrink-0">
            <Select value={range} onValueChange={handleRangeChange}>
              <SelectTrigger className="w-full h-8 bg-bg-page/50 border border-[rgba(237,232,224,0.08)] rounded-lg text-text-primary text-[12px] font-mono">
                <SelectValue>
                  {SELECT_DISPLAY_MAP[range] || "選擇時間"}
                </SelectValue>
              </SelectTrigger>
              <SelectContent className="bg-[#1A1612] border border-white/10 text-text-primary">
                {MERCHANT_PERF_RANGES.map((option) => (
                  <SelectItem key={option} value={option}>
                    {SELECT_DISPLAY_MAP[option]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {hasChartData ? (
          <div className="px-3.5 sm:px-4 py-2.5 flex flex-wrap justify-center gap-2">
            <ChartSeriesToggle
              label="總銷售額"
              color={chartConfig.totalSales.color}
              checked={displayLine}
              onChange={() => setDisplayLine((value) => !value)}
            />
            <ChartSeriesToggle
              label="成交次數"
              color={chartConfig.txCount.color}
              checked={displayBar}
              onChange={() => setDisplayBar((value) => !value)}
            />
            <ChartSeriesToggle
              label="瀏覽"
              color={chartConfig.viewCount.color}
              checked={displayArea}
              onChange={() => setDisplayArea((value) => !value)}
            />
            <ChartSeriesToggle
              label="叫價次數"
              color={chartConfig.offerCount.color}
              checked={displayOffer}
              onChange={() => setDisplayOffer((value) => !value)}
            />
          </div>
        ) : null}

        <div
          className={cn(
            "relative w-full px-1",
            hasChartData ? "h-56 sm:h-64" : "min-h-[200px]",
            isChartLoading ? "opacity-60" : "",
          )}
        >
          {isChartLoading ? (
            <div className="absolute inset-0 z-[2] flex items-center justify-center bg-[#17130f]/50 rounded-xl">
              <div className="w-6 h-6 rounded-full border-2 border-brand border-t-transparent animate-spin" />
            </div>
          ) : null}
          {!hasChartData && !isChartLoading ? (
            <ChartIntervalEmptyState rangeLabel={currentRangeLabel} />
          ) : null}
          {hasChartData ? (
            <ChartContainer config={chartConfig} className="h-full w-full">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartData}>
                  <defs>
                    <linearGradient id="mixViewCount" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#00D2FF" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#00D2FF" stopOpacity={0.0} />
                    </linearGradient>
                    <linearGradient id="mixOfferCount" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#a78bfa" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="#a78bfa" stopOpacity={0.0} />
                    </linearGradient>
                  </defs>

                  <CartesianGrid
                    vertical={false}
                    stroke="rgba(255,255,255,0.04)"
                  />

                  <XAxis
                    dataKey="time"
                    scale="band"
                    tickLine={false}
                    axisLine={false}
                    tickMargin={10}
                    style={{
                      fill: "#8A8680",
                      fontSize: 10,
                      fontFamily: "monospace",
                    }}
                  />

                  <YAxis yAxisId="totalSalesId" hide includeHidden domain={[0, "auto"]} />
                  <YAxis yAxisId="viewCountId" hide includeHidden domain={[0, "auto"]} />
                  <YAxis yAxisId="txCountId" hide includeHidden domain={[0, "auto"]} />
                  <YAxis yAxisId="offerCountId" hide includeHidden domain={[0, "auto"]} />

                  <ChartTooltip
                    cursor={{ fill: "#ffffff", opacity: 0.04 }}
                    content={
                      <ChartTooltipContent
                        className="bg-[#1A1612] border border-white/10 [&&_*]:text-[#eae1da]"
                        labelClassName="text-sm"
                      />
                    }
                  />

                  <Area
                    yAxisId="viewCountId"
                    type="monotone"
                    dataKey="viewCount"
                    fill="url(#mixViewCount)"
                    stroke={chartConfig.viewCount.color}
                    strokeWidth={2}
                    hide={!displayArea}
                  />

                  <Area
                    yAxisId="offerCountId"
                    type="monotone"
                    dataKey="offerCount"
                    fill="url(#mixOfferCount)"
                    stroke={chartConfig.offerCount.color}
                    strokeWidth={2}
                    hide={!displayOffer}
                  />

                  <Line
                    yAxisId="totalSalesId"
                    type="monotone"
                    dataKey="totalSales"
                    stroke={chartConfig.totalSales.color}
                    strokeWidth={2.5}
                    dot={{ r: 3 }}
                    activeDot={{ r: 5 }}
                    hide={!displayLine}
                  />

                  <Bar
                    yAxisId="txCountId"
                    dataKey="txCount"
                    fill={chartConfig.txCount.color}
                    radius={[3, 3, 0, 0]}
                    maxBarSize={8}
                    hide={!displayBar}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </ChartContainer>
          ) : null}
        </div>
      </div>

      <div
        id="sku-history"
        className={cn(
          "rounded-xl border border-[rgba(237,232,224,0.08)] bg-bg-card overflow-hidden",
          isHistoryLoading ? "opacity-60" : "",
        )}
      >
        <div className="px-3.5 py-3 sm:px-4 border-b border-[rgba(237,232,224,0.06)]">
          <h2 className={SECTION_TITLE_CLASS}>
            交易歷史
          </h2>
          <p className="mt-0.5 font-mono text-[10px] text-text-disabled">
            {currentRangeLabel}
          </p>
        </div>

        {(history?.meta.totalCount ?? 0) === 0 ? (
          <div className="py-10 px-4 text-center font-sans text-[13px] text-text-disabled">
            該商品於當前區間內暫無交易歷史記錄
          </div>
        ) : (
          <div className="p-3 sm:p-4 space-y-2">
            <div className="hidden sm:grid sm:grid-cols-4 px-2 text-[10px] font-mono text-text-secondary uppercase tracking-wider">
              <span>交易日期</span>
              <span>訂單編號</span>
              <span>買家藏家</span>
              <span className="text-right">成交價金額</span>
            </div>

            {(history?.items ?? []).map((tx) => (
              <div
                key={tx.orderId}
                className="rounded-lg border border-[rgba(237,232,224,0.06)] bg-bg-page/30 px-3 py-2.5 sm:grid sm:grid-cols-4 sm:items-center sm:py-3 transition-colors hover:border-brand/20"
              >
                <div className="flex items-center justify-between gap-2 sm:block">
                  <span className="font-mono text-[10px] text-text-disabled sm:hidden">
                    交易日期
                  </span>
                  <span className="font-mono text-[11px] sm:text-[12px] text-text-disabled tabular-nums">
                    {formatEventAt(tx.eventAt)}
                  </span>
                </div>
                <div className="mt-2 flex items-center justify-between gap-2 sm:mt-0 sm:block">
                  <span className="font-mono text-[10px] text-text-disabled sm:hidden">
                    訂單編號
                  </span>
                  <Link
                    href={`/profile/merchant/orderDetail/${tx.orderId}`}
                    className="font-mono text-[11px] sm:text-[12px] text-brand font-semibold hover:text-brand/80 underline decoration-dotted underline-offset-4 decoration-brand/30 hover:decoration-brand transition-colors truncate block max-w-max"
                    title="查看訂單詳情"
                  >
                    {tx.orderNumber}
                  </Link>
                </div>
                <div className="mt-2 flex items-center justify-between gap-2 sm:mt-0 sm:block">
                  <span className="font-mono text-[10px] text-text-disabled sm:hidden">
                    買家藏家
                  </span>
                  <Link
                    href={`/profile/${tx.buyerId}`}
                    className="font-sans text-[12px] text-text-primary hover:text-brand underline decoration-dotted underline-offset-4 decoration-white/20 hover:decoration-brand transition-colors truncate block max-w-max"
                    title={`查看 ${tx.buyerName} 的公開個人檔案`}
                  >
                    {tx.buyerName}
                  </Link>
                </div>
                <div className="mt-2 flex items-center justify-between gap-2 sm:mt-0 sm:block">
                  <span className="font-mono text-[10px] text-text-disabled sm:hidden">
                    成交價
                  </span>
                  <span className="sm:text-right font-mono text-[12px] sm:text-[13px] text-brand font-bold tabular-nums">
                    {formatCurrency(tx.finalPrice)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="border-t border-[rgba(237,232,224,0.06)] px-3 py-2 sm:px-4">
          <Pagination
            currentPage={historyPage}
            totalPages={history?.meta.totalPages ?? 1}
            onPageChange={handleHistoryPageChange}
            itemLabel="筆交易流水"
            totalItems={history?.meta.totalCount ?? 0}
            itemsPerPage={history?.meta.pageSize ?? 6}
            enableScroll={true}
            scrollToViewId="sku-history"
          />
        </div>
      </div>
    </section>
  );
}
