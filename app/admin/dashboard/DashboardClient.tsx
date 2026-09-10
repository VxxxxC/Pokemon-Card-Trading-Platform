"use client";

import { useEffect, useId, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
} from "recharts";
import {
  TrendingUp,
  RefreshCw,
  ArrowRight,
} from "lucide-react";
import { getAdminSystemHealthStatus } from "@/app/actions/admin-dashboard";
import {
  FORM_SECTION_CLASS,
} from "@/app/admin/campaigns/campaigns-ui";
import type {
  AdminDashboardMetrics,
  AdminDashboardSystemService,
  AdminDashboardTrendPoint,
} from "@/lib/admin-dashboard/types";
import { formatHkd } from "@/lib/admin-dashboard/format";
import {
  buildMonthTrend,
  ADMIN_DASHBOARD_TREND_DEFAULT_MONTHS,
  ADMIN_DASHBOARD_TREND_MAX_MONTHS,
} from "@/lib/admin-dashboard/trends";

const EMPTY_TREND = buildMonthTrend([], ADMIN_DASHBOARD_TREND_MAX_MONTHS);

type DashboardTrendRange = "6m" | "12m";

const TREND_RANGE_MONTHS: Record<DashboardTrendRange, number> = {
  "6m": ADMIN_DASHBOARD_TREND_DEFAULT_MONTHS,
  "12m": ADMIN_DASHBOARD_TREND_MAX_MONTHS,
};

function sliceTrendPoints(
  points: AdminDashboardTrendPoint[],
  range: DashboardTrendRange,
): AdminDashboardTrendPoint[] {
  const monthCount = TREND_RANGE_MONTHS[range];
  if (points.length <= monthCount) {
    return points;
  }
  return points.slice(points.length - monthCount);
}

function trendRangeLabel(range: DashboardTrendRange): string {
  return range === "6m" ? "近六月趨勢" : "近十二月趨勢";
}

type AdminDashboardClientProps = {
  metrics: AdminDashboardMetrics | null;
  loadError: string | null;
  initialServices: AdminDashboardSystemService[];
  healthLoadError: string | null;
};

type DashboardTodoItem = {
  id: string;
  label: string;
  count: number;
  onClick: () => void;
  countClassName?: string;
};

const EMPTY_METRICS: AdminDashboardMetrics = {
  userEcology: {
    totalUsers: 0,
    totalUsersFormatted: "0",
    bannedUsers: null,
    activeRatio: null,
    activeCount: null,
    distribution: [],
  },
  marketVolume: {
    totalGmv: "HK$ 0",
    monthlyGmv: "HK$ 0",
    settledCount: "0 筆",
    monthlySettledCount: "0 筆",
    listingCount: "0 件",
    growthRate: null,
  },
  revenues: {
    totalCommission: "HK$ 0",
    monthlyCommission: "HK$ 0",
    commissionRate: "8.0%",
    commissionGrowth: null,
    appraisalTotal: "HK$ 0",
    monthlyAppraisal: "HK$ 0",
    monthlyNetRevenue: "HK$ 0",
    totalNetRevenue: "HK$ 0",
    monthlyAppraisalCount: "0 筆交易",
    appraisalFeePerCard: "HK$ 150",
    totalAppraisals: "0 筆交易",
  },
  stripeBalance: {
    availableFormatted: "—",
    pendingFormatted: "—",
    currency: "HKD",
    lastSyncedAt: new Date(0).toISOString(),
    unavailable: true,
    unavailableReason: null,
  },
  alerts: {
    unprocessedReports: 0,
    pendingKyc: 0,
    pendingGrading: 0,
  },
  syncedAt: new Date(0).toISOString(),
  trends: {
    netRevenue: EMPTY_TREND,
    gmv: EMPTY_TREND,
  },
};

function formatSyncedAt(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return `${date.toLocaleDateString("zh-TW", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })} ${date.toLocaleTimeString("zh-TW", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })}`;
}

function hasGrowthValue(value: string | null): boolean {
  if (!value) return false;
  const normalized = value.trim().toUpperCase();
  return normalized !== "N/A" && normalized !== "—";
}

function serviceStatusDotClass(
  status: AdminDashboardSystemService["status"],
): string {
  if (status === "offline") return "bg-warning/80";
  if (status === "degraded") return "bg-brand/70";
  return "bg-text-disabled/35";
}

function serviceStatusLabel(
  status: AdminDashboardSystemService["status"],
): string | null {
  if (status === "offline") return "離線";
  if (status === "degraded") return "降級";
  return null;
}

function formatHealthToastDescription(
  services: AdminDashboardSystemService[],
): string {
  const offline = services.filter((service) => service.status === "offline");
  const degraded = services.filter((service) => service.status === "degraded");

  if (offline.length > 0) {
    return `離線：${offline.map((service) => service.name).join("、")}`;
  }

  if (degraded.length > 0) {
    return `降級：${degraded.map((service) => service.name).join("、")}`;
  }

  const maxLatency = Math.max(...services.map((service) => service.latency), 0);
  return `後台服務器、支付託管及爬蟲引擎已檢測（最高延遲 ${maxLatency} 毫秒）`;
}

function DashboardTrendChart({
  points,
  rangeLabel,
}: {
  points: AdminDashboardTrendPoint[];
  rangeLabel: string;
}) {
  const gradientId = useId().replace(/:/g, "");
  const chartData = useMemo(
    () =>
      points.map((point) => ({
        label: point.label,
        value: point.value,
      })),
    [points],
  );

  const hasData = chartData.some((point) => point.value > 0);
  const values = chartData.map((point) => point.value);
  const trendUp =
    values.length >= 2 && values[values.length - 1] >= values[0];
  const strokeColor = trendUp ? "#d4a574" : "#f59e0b";
  const xTickInterval = chartData.length > 6 ? 1 : 0;

  if (chartData.length < 2) {
    return null;
  }

  if (!hasData) {
    return (
      <div
        className="flex h-14 w-full items-center justify-center rounded-md border border-dashed border-white/[0.06] font-mono text-[9px] text-text-disabled sm:h-16"
        role="img"
        aria-label={`${rangeLabel}暫無數據`}
      >
        暫無趨勢
      </div>
    );
  }

  return (
    <div
      className="w-full min-w-0 overflow-visible px-1"
      role="img"
      aria-label={rangeLabel}
    >
      <ResponsiveContainer width="100%" height={80}>
        <AreaChart
          data={chartData}
          margin={{ top: 8, right: 16, left: 16, bottom: 4 }}
        >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={strokeColor} stopOpacity={0.35} />
              <stop offset="100%" stopColor={strokeColor} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <XAxis
            dataKey="label"
            axisLine={false}
            tickLine={false}
            interval={xTickInterval}
            padding={{ left: 24, right: 24 }}
            tickMargin={8}
            tick={{
              fill: "rgba(237, 232, 224, 0.45)",
              fontSize: 9,
              fontFamily: "var(--font-mono, ui-monospace, monospace)",
            }}
          />
          <YAxis hide domain={[0, "auto"]} />
          <Tooltip
            cursor={{ stroke: "rgba(255,255,255,0.12)", strokeWidth: 1 }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) {
                return null;
              }

              const row = payload[0]?.payload as
                | { label: string; value: number }
                | undefined;
              if (!row) {
                return null;
              }

              return (
                <div className="rounded border border-white/10 bg-bg-card px-2 py-1 font-mono text-[10px] text-text-primary shadow-lg">
                  {row.label} {formatHkd(row.value)}
                </div>
              );
            }}
          />
          <Area
            type="monotone"
            dataKey="value"
            stroke={strokeColor}
            strokeWidth={1.5}
            fill={`url(#${gradientId})`}
            dot={{
              r: 2.5,
              fill: strokeColor,
              strokeWidth: 0,
            }}
            activeDot={{
              r: 3.5,
              fill: strokeColor,
              stroke: "#17130f",
              strokeWidth: 1,
            }}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function DashboardTrendRangeToggle({
  value,
  onChange,
}: {
  value: DashboardTrendRange;
  onChange: (range: DashboardTrendRange) => void;
}) {
  return (
    <div
      className="flex flex-col items-end gap-1"
      title="僅切換下方趨勢圖顯示範圍；本月與歷史統計數字不受影響"
    >
      <span className="font-mono text-[9px] text-text-disabled">
        趨勢圖時間範圍
      </span>
      <div
        className="inline-flex rounded-md border border-white/[0.08] p-0.5"
        role="group"
        aria-label="趨勢圖時間範圍（不影響統計數字）"
      >
        {(["6m", "12m"] as const).map((range) => {
          const active = value === range;
          return (
            <button
              key={range}
              type="button"
              onClick={() => onChange(range)}
              aria-pressed={active}
              className={`rounded px-2 py-0.5 font-mono text-[9px] transition-colors ${
                active
                  ? "bg-brand/15 text-brand"
                  : "text-text-disabled hover:text-text-secondary"
              }`}
            >
              {range === "6m" ? "6M" : "12M"}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function AdminDashboardClient({
  metrics,
  loadError,
  initialServices,
  healthLoadError,
}: AdminDashboardClientProps) {
  const router = useRouter();
  const [isRefreshingMetrics, startMetricsRefresh] = useTransition();

  const [services, setServices] = useState<AdminDashboardSystemService[]>(
    initialServices,
  );
  const [isRefreshingServices, startServicesRefresh] = useTransition();

  useEffect(() => {
    setServices(initialServices);
  }, [initialServices]);

  const hasMetrics = metrics != null;
  const dashboardMetrics = metrics ?? EMPTY_METRICS;
  const userEcology = dashboardMetrics.userEcology;
  const marketVolume = dashboardMetrics.marketVolume;
  const revenues = dashboardMetrics.revenues;
  const trends = dashboardMetrics.trends;
  const stripeBalance = dashboardMetrics.stripeBalance;
  const unprocessedReports = dashboardMetrics.alerts.unprocessedReports;
  const pendingKyc = dashboardMetrics.alerts.pendingKyc;
  const pendingGrading = dashboardMetrics.alerts.pendingGrading;
  const bannedUsers = userEcology.bannedUsers;

  const [trendRange, setTrendRange] = useState<DashboardTrendRange>("6m");

  const trendRangeHeading = trendRangeLabel(trendRange);
  const slicedNetRevenueTrend = useMemo(
    () => sliceTrendPoints(trends.netRevenue, trendRange),
    [trends.netRevenue, trendRange],
  );
  const slicedGmvTrend = useMemo(
    () => sliceTrendPoints(trends.gmv, trendRange),
    [trends.gmv, trendRange],
  );

  const syncedAtLabel = isRefreshingMetrics
    ? "更新中…"
    : metrics?.syncedAt
      ? `最後同步：${formatSyncedAt(metrics.syncedAt)}`
      : "最後同步：—";

  const todoItems = useMemo(() => {
    const items: DashboardTodoItem[] = [];

    if (unprocessedReports > 0) {
      items.push({
        id: "disputes",
        label: "未處理爭議",
        count: unprocessedReports,
        onClick: () => router.push("/admin/disputes?status=pending"),
        countClassName: "text-warning",
      });
    }

    if (pendingKyc > 0) {
      items.push({
        id: "kyc",
        label: "商戶入駐待審",
        count: pendingKyc,
        onClick: () => router.push("/admin/merchants"),
        countClassName: "text-brand",
      });
    }

    if (pendingGrading > 0) {
      items.push({
        id: "grading",
        label: "鑑定待處理",
        count: pendingGrading,
        onClick: () => router.push("/admin/grading"),
        countClassName:
          pendingGrading >= 10 ? "text-brand font-bold" : "text-text-primary",
      });
    }

    return items;
  }, [
    unprocessedReports,
    pendingKyc,
    pendingGrading,
    router,
  ]);

  const handleRefreshMetrics = () => {
    startMetricsRefresh(() => {
      router.refresh();
    });
  };

  const handleRefreshServices = () => {
    startServicesRefresh(async () => {
      const result = await getAdminSystemHealthStatus();
      if (!result.success) {
        toast.error("系統服務狀態檢測失敗", {
          description: result.error,
        });
        return;
      }

      setServices(result.data.services);
      const hasOffline = result.data.services.some(
        (service) => service.status === "offline",
      );
      const hasDegraded = result.data.services.some(
        (service) => service.status === "degraded",
      );

      if (hasOffline) {
        toast.error("部分系統服務離線", {
          description: formatHealthToastDescription(result.data.services),
        });
        return;
      }

      if (hasDegraded) {
        toast.warning("部分系統服務降級", {
          description: formatHealthToastDescription(result.data.services),
        });
        return;
      }

      toast.success("系統服務狀態已更新", {
        description: formatHealthToastDescription(result.data.services),
      });
    });
  };

  return (
    <div className="space-y-5 pb-8">
      <header>
        <div className="mt-1 flex items-center gap-2">
          <p className="font-mono text-[10px] text-text-disabled">
            {syncedAtLabel}
          </p>
          <button
            type="button"
            onClick={handleRefreshMetrics}
            disabled={isRefreshingMetrics}
            aria-label="重新整理數據"
            className="inline-flex shrink-0 items-center justify-center rounded-md p-0.5 text-text-disabled/70 transition-colors hover:text-brand disabled:opacity-60"
          >
            <RefreshCw
              className={`size-3 ${isRefreshingMetrics ? "animate-spin" : ""}`}
            />
          </button>
        </div>
      </header>

      {loadError ? (
        <div className="rounded-lg border border-warning/30 bg-warning/10 px-3 py-2.5 font-sans text-[13px] text-warning">
          {loadError}
        </div>
      ) : null}

      {!hasMetrics && !loadError ? (
        <div className="rounded-lg border border-white/[0.08] bg-bg-card px-3 py-2.5 font-sans text-[13px] text-text-secondary">
          無法載入儀表板數據。
        </div>
      ) : null}

      {healthLoadError ? (
        <div className="rounded-lg border border-warning/30 bg-warning/10 px-3 py-2.5 font-sans text-[13px] text-warning">
          {healthLoadError}
        </div>
      ) : null}

      {hasMetrics ? (
        <>
      <section className="space-y-6 border-b border-white/[0.08] pb-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className={FORM_SECTION_CLASS}>核心營收與成交指標</h2>
          <DashboardTrendRangeToggle
            value={trendRange}
            onChange={setTrendRange}
          />
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="space-y-4 rounded-xl border border-[rgba(237,232,224,0.12)] bg-bg-card p-4 shadow-sm shadow-black/30">
            <p className="font-sans text-[13px] font-semibold text-text-secondary">
              平台淨營收
            </p>
            <div className="flex flex-col divide-y divide-white/[0.06]">
              <div className="pb-4">
                <span className="font-mono text-[10px] tracking-wide text-text-disabled">
                  本月總營收
                </span>
                <p className="mt-2 font-mono text-[20px] font-bold tracking-tight tabular-nums text-brand sm:text-[24px]">
                  {revenues.monthlyNetRevenue}
                </p>
                <p className="mt-2 font-mono text-[11px] leading-relaxed text-text-secondary">
                  歷史總營收 {revenues.totalNetRevenue}
                </p>
                <div className="mt-3 space-y-1.5">
                  <span className="font-mono text-[9px] text-text-disabled">
                    {trendRangeHeading}
                  </span>
                  <DashboardTrendChart
                    points={slicedNetRevenueTrend}
                    rangeLabel={trendRangeHeading}
                  />
                </div>
              </div>
              <div className="flex flex-col divide-y divide-white/[0.06] pb-4 pt-4 sm:flex-row sm:divide-x sm:divide-y-0">
                <div className="pb-4 sm:flex-1 sm:pb-0 sm:pr-5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-[10px] tracking-wide text-text-disabled">
                      本月佣金
                    </span>
                    <span className="rounded-lg border border-brand/20 bg-brand/10 px-2 py-0.5 font-mono text-[10px] text-brand">
                      佣金率 {revenues.commissionRate}
                    </span>
                  </div>
                  <p className="mt-2 font-mono text-[18px] font-bold tracking-tight tabular-nums text-brand sm:text-[22px]">
                    {revenues.monthlyCommission}
                  </p>
                  <p className="mt-2 font-mono text-[11px] leading-relaxed text-text-secondary">
                    歷史營收 {revenues.totalCommission}
                  </p>
                  {hasGrowthValue(revenues.commissionGrowth) ? (
                    <span className="mt-2 inline-flex items-center gap-0.5 rounded border border-success/20 bg-success/10 px-1.5 py-0.5 font-mono text-[10px] text-success">
                      <TrendingUp className="size-3" />
                      {revenues.commissionGrowth}
                    </span>
                  ) : null}
                </div>
                <div className="pt-4 sm:flex-1 sm:pt-0 sm:pl-5">
                  <span className="block font-mono text-[10px] tracking-wide text-text-disabled">
                    本月鑑定費
                  </span>
                  <p className="mt-2 font-mono text-[18px] font-bold tracking-tight tabular-nums text-brand sm:text-[22px]">
                    {revenues.monthlyAppraisal}
                  </p>
                  <p className="mt-2 font-mono text-[11px] leading-relaxed text-text-secondary">
                    歷史總值 {revenues.appraisalTotal}
                  </p>
                </div>
              </div>
              <div className="pt-4">
                <div className="flex min-w-0 items-baseline gap-2">
                  <span className="shrink-0 font-mono text-[10px] text-text-disabled">
                    stripe可用餘額
                  </span>
                  <p className="min-w-0 truncate font-mono text-[13px] font-semibold tabular-nums text-brand">
                    {stripeBalance.availableFormatted}
                  </p>
                </div>
                {stripeBalance.unavailable ? (
                  <p className="mt-2 font-mono text-[11px] text-warning">
                    {stripeBalance.unavailableReason ?? "餘額暫不可用"}
                  </p>
                ) : null}
              </div>
            </div>
          </div>

          <div className="space-y-4 rounded-xl border border-[rgba(237,232,224,0.12)] bg-bg-card p-4 shadow-sm shadow-black/30">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="font-sans text-[13px] font-semibold text-text-secondary">
                交易量分析
              </p>
            </div>
            <div className="space-y-3">
              <div>
                <span className="font-mono text-[10px] tracking-wide text-text-disabled">
                  本月總成交
                </span>
                <p className="mt-1.5 font-mono text-[20px] font-bold tabular-nums text-brand sm:text-[22px]">
                  {marketVolume.monthlyGmv}
                </p>
                <p className="mt-2 font-mono text-[11px] leading-relaxed text-text-secondary">
                  歷史總值 {marketVolume.totalGmv}
                </p>
                <div className="mt-3 space-y-1.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-mono text-[9px] text-text-disabled">
                      {trendRangeHeading}
                    </span>
                    {hasGrowthValue(marketVolume.growthRate) ? (
                      <span className="inline-flex items-center gap-0.5 rounded border border-success/20 bg-success/10 px-1.5 py-0.5 font-mono text-[10px] text-success">
                        <TrendingUp className="size-3" />
                        {marketVolume.growthRate} 較上月
                      </span>
                    ) : null}
                  </div>
                  <DashboardTrendChart
                    points={slicedGmvTrend}
                    rangeLabel={trendRangeHeading}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-x-4 border-t border-white/[0.06] pt-3">
                <div className="flex flex-col gap-y-3">
                  <div className="flex min-w-0 items-baseline gap-2">
                    <span className="shrink-0 font-mono text-[10px] text-text-disabled">
                      本月成交量
                    </span>
                    <p className="font-mono text-[15px] font-bold tabular-nums text-text-primary">
                      {marketVolume.monthlySettledCount}
                    </p>
                  </div>
                  <div className="flex min-w-0 items-baseline gap-2">
                    <span className="shrink-0 font-mono text-[10px] text-text-disabled">
                      本月鑑定
                    </span>
                    <p className="font-mono text-[15px] font-bold tabular-nums text-text-primary">
                      {revenues.monthlyAppraisalCount}
                    </p>
                  </div>
                  <div className="flex min-w-0 items-baseline gap-2">
                    <span className="shrink-0 font-mono text-[10px] text-text-disabled">
                      活躍掛單
                    </span>
                    <p className="font-mono text-[15px] font-bold tabular-nums text-text-primary">
                      {marketVolume.listingCount}
                    </p>
                  </div>
                </div>
                <div className="flex flex-col gap-y-3">
                  <div className="flex min-w-0 items-baseline gap-2">
                    <span className="shrink-0 font-mono text-[10px] text-text-disabled">
                      歷史成交量
                    </span>
                    <p className="font-mono text-[15px] font-bold tabular-nums text-text-primary">
                      {marketVolume.settledCount}
                    </p>
                  </div>
                  <div className="flex min-w-0 items-baseline gap-2">
                    <span className="shrink-0 font-mono text-[10px] text-text-disabled">
                      歷史鑑定
                    </span>
                    <p className="font-mono text-[15px] font-bold tabular-nums text-text-primary">
                      {revenues.totalAppraisals}
                    </p>
                  </div>
                  <div className="flex min-w-0 items-baseline gap-2 min-h-[22px]" aria-hidden />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="space-y-4 border-b border-white/[0.08] pb-5">
        <div>
          <h2 className={FORM_SECTION_CLASS}>全平台會員角色分佈</h2>
        </div>

        <div className="mx-auto max-w-sm">
          <div className="relative flex h-[160px] w-full items-center justify-center sm:h-[180px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={userEcology.distribution}
                  dataKey="count"
                  nameKey="role"
                  cx="50%"
                  cy="50%"
                  innerRadius={52}
                  outerRadius={76}
                  paddingAngle={3}
                  stroke="none"
                >
                  {userEcology.distribution.map((entry) => (
                    <Cell
                      key={entry.key}
                      fill={entry.color}
                      className="transition-opacity hover:opacity-80"
                    />
                  ))}
                </Pie>
                <Tooltip
                  wrapperStyle={{ zIndex: 50 }}
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const data = payload[0].payload;
                      return (
                        <div className="space-y-1 rounded-lg border border-white/10 bg-bg-card p-2.5 font-mono text-[12px] shadow-xl">
                          <p
                            className="font-sans font-bold text-text-primary"
                            style={{ color: data.color }}
                          >
                            {data.role}
                          </p>
                          <p className="text-text-secondary">
                            數量{" "}
                            <span className="font-bold text-text-primary">
                              {data.formattedCount}
                            </span>
                          </p>
                          <p className="text-text-secondary">
                            佔比{" "}
                            <span className="font-bold text-text-primary">
                              {data.pctStr}
                            </span>
                          </p>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
              </PieChart>
            </ResponsiveContainer>

            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span className="font-mono text-[10px] text-text-disabled">
                總註冊用戶
              </span>
              <span className="mt-0.5 font-mono text-[24px] font-bold leading-none tracking-tight text-text-primary">
                {userEcology.totalUsersFormatted}
              </span>
            </div>
          </div>

          <div className="mt-2 flex flex-wrap justify-center gap-x-3 gap-y-1">
            {userEcology.distribution.map((item) => (
              <span
                key={item.key}
                className="font-mono text-[10px] text-text-secondary"
              >
                <span style={{ color: item.color }}>●</span>{" "}
                {item.role} {item.pctStr}
              </span>
            ))}
          </div>
          {bannedUsers != null && bannedUsers > 0 ? (
            <p className="mt-2 text-center font-mono text-[10px] text-text-disabled">
              已封鎖帳戶 {bannedUsers.toLocaleString("zh-TW")}
            </p>
          ) : null}
        </div>
      </section>
        </>
      ) : null}

      <section className="space-y-4">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 py-1">
          <div className="flex shrink-0 items-center gap-1">
            <span className="font-sans text-[10px] text-text-disabled">
              系統運作狀態
            </span>
            <button
              type="button"
              onClick={handleRefreshServices}
              disabled={isRefreshingServices}
              aria-label="檢測系統狀態"
              className="inline-flex shrink-0 items-center justify-center rounded-md p-0.5 text-text-disabled/70 transition-colors hover:text-text-secondary disabled:opacity-60"
            >
              <RefreshCw
                className={`size-3 ${isRefreshingServices ? "animate-spin" : ""}`}
              />
            </button>
          </div>
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1">
            {services.map((service) => {
              const statusLabel = serviceStatusLabel(service.status);
              return (
                <div
                  key={service.id}
                  title={
                    statusLabel
                      ? `${service.name}：${statusLabel}`
                      : service.name
                  }
                  className="flex min-w-0 max-w-[9.5rem] items-center gap-1"
                >
                  <span
                    className={`size-1 shrink-0 rounded-full ${serviceStatusDotClass(service.status)}`}
                  />
                  <span className="truncate font-mono text-[10px] text-text-disabled">
                    {service.name}
                  </span>
                  {statusLabel ? (
                    <span
                      className={`shrink-0 font-mono text-[9px] ${
                        service.status === "offline"
                          ? "text-warning/80"
                          : "text-brand/80"
                      }`}
                    >
                      {statusLabel}
                    </span>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>

        <div className="space-y-4 rounded-xl border border-[rgba(237,232,224,0.12)] bg-bg-card p-4 shadow-sm shadow-black/30">
          <p className="font-sans text-[13px] font-semibold text-text-secondary">
            待辦
          </p>
          {!hasMetrics ? (
            <p className="py-4 text-center font-sans text-[13px] text-text-secondary">
              暫無待處理項目
            </p>
          ) : todoItems.length === 0 ? (
            <p className="py-4 text-center font-sans text-[13px] text-text-secondary">
              暫無待處理項目
            </p>
          ) : (
            <div className="divide-y divide-white/[0.06]">
              {todoItems.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={item.onClick}
                  className="flex w-full items-center justify-between gap-3 px-1 py-3 text-left transition-colors hover:bg-brand/5"
                >
                  <span className="font-sans text-[13px] text-text-primary">
                    {item.label}
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    <span
                      className={`font-mono text-[13px] tabular-nums ${item.countClassName ?? "text-text-primary"}`}
                    >
                      {item.count.toLocaleString("zh-TW")}
                    </span>
                    <span className="font-sans text-[11px] text-brand">
                      前往
                      <ArrowRight className="ml-0.5 inline size-3" />
                    </span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
