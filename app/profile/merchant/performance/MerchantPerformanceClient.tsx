"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import Image from "next/image";
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
  ChartLegend,
  ChartLegendContent,
  type ChartConfig,
} from "@/components/ui/chart";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getMerchantPerformanceAnalytics } from "@/app/actions/merchant-performance";
import {
  MERCHANT_PERF_RANGES,
  RANGE_LABEL_MAP,
  SELECT_DISPLAY_MAP,
  isMerchantPerformanceRange,
} from "@/lib/dashboard/merchant-performance-ranges";
import type {
  MerchantPerformanceAnalytics,
  MerchantPerformanceMetricBlock,
  MerchantPerformanceRange,
} from "@/lib/dashboard/merchant-performance-types";
import { DEFAULT_AVATAR_URL } from "@/lib/profile/avatar";
import { cn } from "@/lib/utils";
import { SECTION_TITLE_CLASS } from "@/lib/ui/section-title-ui";
import { ChartLine } from "lucide-react";

const chartConfig = {
  turnover: {
    label: "營業額",
    color: "#d4a574",
  },
  avgPrice: {
    label: "平均價",
    color: "#00D2FF",
  },
  txCount: {
    label: "成交總數",
    color: "#10b981",
  },
} satisfies ChartConfig;

function hasIntervalChartData(
  interval: MerchantPerformanceMetricBlock,
  series: MerchantPerformanceAnalytics["series"],
): boolean {
  if (interval.txCount > 0 || interval.turnover > 0) {
    return true;
  }

  return series.some(
    (point) => point.txCount > 0 || point.turnover > 0 || point.avgPrice > 0,
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
        {rangeLabel}內暫無成交紀錄
      </p>
      <p className="mt-1 max-w-[280px] font-sans text-[12px] text-text-disabled leading-relaxed">
        完成首筆訂單後，營收、價格與成交量趨勢將顯示於此
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

type MerchantPerformanceClientProps = {
  initialData: MerchantPerformanceAnalytics | null;
  bootstrapError?: string;
};

export function MerchantPerformanceClient({
  initialData,
  bootstrapError,
}: MerchantPerformanceClientProps) {
  const [range, setRange] = useState<MerchantPerformanceRange>(
    initialData?.timeRange ?? "7d",
  );
  const [analytics, setAnalytics] = useState<MerchantPerformanceAnalytics | null>(
    initialData,
  );
  const [isChartLoading, setIsChartLoading] = useState(false);
  const [displayArea, setDisplayArea] = useState(true);
  const [displayLine, setDisplayLine] = useState(true);
  const [displayBar, setDisplayBar] = useState(true);

  const handleRangeChange = useCallback(async (nextRange: string | null) => {
    if (!nextRange || !isMerchantPerformanceRange(nextRange) || nextRange === range) {
      return;
    }

    const previousRange = range;
    setRange(nextRange);
    setIsChartLoading(true);

    try {
      const result = await getMerchantPerformanceAnalytics(nextRange);
      if (!result.success) {
        throw new Error(result.error);
      }

      setAnalytics((current) =>
        current
          ? {
              ...current,
              interval: result.data.interval,
              series: result.data.series,
              timeRange: result.data.timeRange,
            }
          : result.data,
      );
    } catch (error) {
      setRange(previousRange);
      toast.error(
        error instanceof Error ? error.message : "無法載入區間業績資料",
      );
    } finally {
      setIsChartLoading(false);
    }
  }, [range]);

  const activeData = analytics?.series ?? [];
  const allTimeMetrics = analytics?.allTime ?? {
    turnover: 0,
    txCount: 0,
    avgPrice: 0,
  };
  const intervalMetrics = analytics?.interval ?? {
    turnover: 0,
    txCount: 0,
    avgPrice: 0,
  };
  const topProducts = analytics?.topProducts ?? [];
  const topSpenders = analytics?.topSpenders ?? [];
  const currentRangeLabel = RANGE_LABEL_MAP[range] || "當前區間";
  const hasChartData = hasIntervalChartData(intervalMetrics, activeData);

  return (
    <section
      aria-label="店舖經營與業績分析"
      className="space-y-4 animate-fadeIn text-text-primary"
    >
      {bootstrapError ? (
        <div className="mb-4 px-4 py-3 bg-[rgba(239,68,68,0.06)] border border-warning/25 rounded-xl">
          <p className="font-sans text-[13px] text-warning">
            無法載入業績分析：{bootstrapError}
          </p>
        </div>
      ) : null}

      <section
        className="rounded-xl overflow-hidden bg-bg-card border border-[rgba(237,232,224,0.08)]"
        aria-label="歷史累計業績"
      >
        <div className="flex divide-x divide-[rgba(237,232,224,0.06)]">
          <div className="flex-1 min-w-0 px-3 py-3 sm:px-4 sm:py-3.5">
            <p className="font-mono text-[9px] sm:text-[10px] text-text-secondary truncate leading-tight">
              歷史累計總營業額
            </p>
            <p className="font-mono font-bold text-[13px] sm:text-[15px] text-[#d4a574] leading-tight mt-1 truncate tabular-nums">
              HK$ {allTimeMetrics.turnover.toLocaleString()}
            </p>
          </div>
          <div className="flex-1 min-w-0 px-3 py-3 sm:px-4 sm:py-3.5">
            <p className="font-mono text-[9px] sm:text-[10px] text-text-secondary truncate leading-tight">
              歷史累計平均單價
            </p>
            <p className="font-mono font-bold text-[13px] sm:text-[15px] text-[#00D2FF] leading-tight mt-1 truncate tabular-nums">
              HK$ {allTimeMetrics.avgPrice.toLocaleString()}
            </p>
          </div>
          <div className="flex-1 min-w-0 px-3 py-3 sm:px-4 sm:py-3.5">
            <p className="font-mono text-[9px] sm:text-[10px] text-text-secondary truncate leading-tight">
              歷史累計總成交次數
            </p>
            <p className="font-mono font-bold text-[13px] sm:text-[15px] text-[#10b981] leading-tight mt-1 truncate tabular-nums">
              {allTimeMetrics.txCount.toLocaleString()}
              <span className="text-text-secondary font-normal text-[10px] sm:text-[11px]">
                {" "}
                次
              </span>
            </p>
          </div>
        </div>
      </section>

      <div className="rounded-xl border border-[rgba(237,232,224,0.08)] bg-bg-card overflow-hidden">
        <div className="px-3.5 py-3 sm:px-4 border-b border-[rgba(237,232,224,0.06)] flex items-center justify-between gap-3 flex-wrap">
          <p className={SECTION_TITLE_CLASS}>
            營收、價格與成交量
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
          <div className="px-3.5 sm:px-4 py-2 flex flex-wrap justify-center gap-2">
            <ChartSeriesToggle
              label="平均價"
              color={chartConfig.avgPrice.color}
              checked={displayArea}
              onChange={() => setDisplayArea((value) => !value)}
            />
            <ChartSeriesToggle
              label="營業額"
              color={chartConfig.turnover.color}
              checked={displayLine}
              onChange={() => setDisplayLine((value) => !value)}
            />
            <ChartSeriesToggle
              label="成交總數"
              color={chartConfig.txCount.color}
              checked={displayBar}
              onChange={() => setDisplayBar((value) => !value)}
            />
          </div>
        ) : null}

        <div
          className={cn(
            "relative w-full px-1",
            hasChartData ? "h-56 sm:h-64" : "min-h-[200px]",
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
                <ComposedChart data={activeData}>
                <defs>
                  <linearGradient id="mixAvgPrice" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#00D2FF" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#00D2FF" stopOpacity={0.0} />
                  </linearGradient>
                </defs>

                <CartesianGrid
                  vertical={false}
                  stroke="rgba(255,255,255,0.04)"
                />

                <XAxis
                  dataKey="label"
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

                <YAxis yAxisId="turnover" hide includeHidden domain={["auto", "auto"]} />
                <YAxis yAxisId="avgPrice" hide includeHidden domain={["auto", "auto"]} />
                <YAxis yAxisId="txCount" hide includeHidden domain={["auto", "auto"]} />

                <ChartTooltip
                  cursor={false}
                  content={
                    <ChartTooltipContent
                      className="bg-[#1A1612] border border-white/10 [&&_*]:text-[#eae1da]"
                      labelClassName="text-lg"
                    />
                  }
                />

                <Area
                  yAxisId="avgPrice"
                  type="monotone"
                  dataKey="avgPrice"
                  fill="url(#mixAvgPrice)"
                  stroke={chartConfig.avgPrice.color}
                  strokeWidth={2}
                  hide={!displayArea}
                />

                <Line
                  yAxisId="turnover"
                  type="monotone"
                  dataKey="turnover"
                  stroke={chartConfig.turnover.color}
                  strokeWidth={2.5}
                  dot={{ r: 3 }}
                  activeDot={{ r: 5 }}
                  hide={!displayLine}
                />

                <Bar
                  yAxisId="txCount"
                  dataKey="txCount"
                  fill={chartConfig.txCount.color}
                  radius={[3, 3, 0, 0]}
                  maxBarSize={8}
                  hide={!displayBar}
                />

                  <ChartLegend content={<ChartLegendContent className="mt-4" />} />
                </ComposedChart>
              </ResponsiveContainer>
            </ChartContainer>
          ) : null}
        </div>

        <div className="border-t border-[rgba(237,232,224,0.06)]">
          <div className="px-3.5 py-2.5 sm:px-4 border-b border-[rgba(237,232,224,0.06)]">
            <h2 className={SECTION_TITLE_CLASS}>
              區間營收轉化 ({currentRangeLabel})
            </h2>
          </div>
          <div className="flex divide-x divide-[rgba(237,232,224,0.06)]">
            <div className="flex-1 min-w-0 px-3 py-3 sm:px-4">
              <p className="font-mono text-[9px] sm:text-[10px] text-text-secondary truncate">
                區間總營業額
              </p>
              <p
                className={cn(
                  "font-mono font-bold text-[13px] sm:text-[15px] mt-1 truncate tabular-nums",
                  hasChartData ? "text-[#d4a574]" : "text-text-disabled",
                )}
              >
                {hasChartData
                  ? `HK$ ${intervalMetrics.turnover.toLocaleString()}`
                  : "—"}
              </p>
            </div>
            <div className="flex-1 min-w-0 px-3 py-3 sm:px-4">
              <p className="font-mono text-[9px] sm:text-[10px] text-text-secondary truncate">
                區間平均價 (AOV)
              </p>
              <p
                className={cn(
                  "font-mono font-bold text-[13px] sm:text-[15px] mt-1 truncate tabular-nums",
                  hasChartData ? "text-[#00D2FF]" : "text-text-disabled",
                )}
              >
                {hasChartData
                  ? `HK$ ${intervalMetrics.avgPrice.toLocaleString()}`
                  : "—"}
              </p>
            </div>
            <div className="flex-1 min-w-0 px-3 py-3 sm:px-4">
              <p className="font-mono text-[9px] sm:text-[10px] text-text-secondary truncate">
                區間總交易筆數
              </p>
              <p
                className={cn(
                  "font-mono font-bold text-[13px] sm:text-[15px] mt-1 truncate tabular-nums",
                  hasChartData ? "text-[#10b981]" : "text-text-disabled",
                )}
              >
                {hasChartData ? (
                  <>
                    {intervalMetrics.txCount.toLocaleString()}
                    <span className="text-text-secondary font-normal text-[10px] sm:text-[11px]">
                      {" "}
                      次
                    </span>
                  </>
                ) : (
                  "—"
                )}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 w-full">
        <div className="rounded-xl border border-[rgba(237,232,224,0.08)] bg-bg-card overflow-hidden">
          <div className="px-3.5 py-2.5 sm:px-4 border-b border-[rgba(237,232,224,0.06)]">
            <h3 className={SECTION_TITLE_CLASS}>
              暢銷商品排行榜
            </h3>
          </div>

          {topProducts.length === 0 ? (
            <p className="font-sans text-[12px] text-text-disabled py-8 text-center">
              暫無成交商品紀錄
            </p>
          ) : (
            <div className="divide-y divide-[rgba(237,232,224,0.06)]">
              {topProducts.map((prod) => (
                <div
                  key={`${prod.rank}-${prod.productId}`}
                  className="flex items-center justify-between py-2.5 px-3.5 sm:px-4 text-[13px]"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span
                      className={`w-6 h-6 rounded-full flex items-center justify-center font-mono text-[11px] font-black shrink-0 ${
                        prod.rank === 1
                          ? "bg-brand text-[#17130f]"
                          : prod.rank === 2
                            ? "bg-[#a89888] text-[#17130f]"
                            : prod.rank === 3
                              ? "bg-[#5c554e] text-text-primary"
                              : "bg-[#26211C] text-text-secondary"
                      }`}
                    >
                      {prod.rank}
                    </span>
                    <Link
                      href={`/profile/merchant/analytics?productId=${encodeURIComponent(prod.productId)}`}
                      title={`查看 ${prod.name} 的深度經營分析數據看板`}
                    >
                      <div className="min-w-0">
                        <p className="text-text-primary font-medium truncate">
                          {prod.name}
                        </p>
                        <p className="font-mono text-[10.5px] text-stone-500 hover:text-brand underline decoration-dotted underline-offset-4 decoration-stone-500/30 hover:decoration-brand transition-colors cursor-pointer text-left focus:outline-none truncate block max-w-max uppercase mt-0.5">
                          {prod.skuNo}
                        </p>
                      </div>
                    </Link>
                  </div>

                  <div className="text-right shrink-0 ml-4">
                    <p className="font-mono font-bold text-brand text-[14px]">
                      HK$ {prod.revenue.toLocaleString()}
                    </p>
                    <p className="text-[11px] text-text-secondary mt-0.5">
                      已成交 {prod.volume} 件
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-xl border border-[rgba(237,232,224,0.08)] bg-bg-card overflow-hidden">
          <div className="px-3.5 py-2.5 sm:px-4 border-b border-[rgba(237,232,224,0.06)]">
            <h3 className={SECTION_TITLE_CLASS}>
              高價值客戶
            </h3>
          </div>

          {topSpenders.length === 0 ? (
            <p className="font-sans text-[12px] text-text-disabled py-8 text-center">
              暫無高價值客戶紀錄
            </p>
          ) : (
            <div className="divide-y divide-[rgba(237,232,224,0.06)]">
              {topSpenders.map((client) => (
                <div
                  key={client.buyerId}
                  className="flex items-center justify-between py-2.5 px-3.5 sm:px-4 text-[13px]"
                >
                  <Link
                    href={`/profile/${client.buyerId}`}
                    className="flex items-center gap-3 hover:text-brand transition-colors group min-w-0"
                  >
                    <span className="font-mono text-[11px] text-text-primary w-4 text-center shrink-0">
                      {client.rank}
                    </span>

                    <div className="relative w-8 h-8 rounded-full overflow-hidden shrink-0 border border-white/10">
                      <Image
                        src={client.avatarUrl || DEFAULT_AVATAR_URL}
                        alt={client.name}
                        fill
                        unoptimized
                        className="object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                    </div>

                    <div className="min-w-0">
                      <p className="text-text-primary font-medium group-hover:text-brand transition-colors truncate">
                        {client.name}
                      </p>
                      <p className="text-[10.5px] text-brand uppercase mt-0.5">
                        VIP LEVEL {client.rank <= 3 ? "III" : client.rank <= 6 ? "II" : "I"}
                      </p>
                    </div>
                  </Link>

                  <div className="text-right shrink-0 ml-4">
                    <p className="font-mono font-semibold text-brand text-[14px]">
                      HK$ {client.spending.toLocaleString()}
                    </p>
                    <p className="text-[11px] text-text-secondary mt-0.5">
                      累計消費額
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
