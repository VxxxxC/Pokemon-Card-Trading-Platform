import { getHktMonthRange } from "@/lib/admin-dashboard/hkt-month-bounds";
import { sumInRange } from "@/lib/admin-dashboard/format";
import type { AdminDashboardTrendPoint } from "@/lib/admin-dashboard/types";

export const ADMIN_DASHBOARD_TREND_MAX_MONTHS = 12;
export const ADMIN_DASHBOARD_TREND_DEFAULT_MONTHS = 6;

type TrendRow = { amount: number; recognizedAt: string | null };

export function formatHktMonthShortLabel(offsetMonths = 0): string {
  const { startIso } = getHktMonthRange(offsetMonths);
  return new Intl.DateTimeFormat("zh-TW", {
    month: "short",
    timeZone: "Asia/Hong_Kong",
  }).format(new Date(startIso));
}

export function buildMonthTrend(
  rows: TrendRow[],
  monthCount = ADMIN_DASHBOARD_TREND_MAX_MONTHS,
): AdminDashboardTrendPoint[] {
  const safeCount = Math.max(1, Math.min(monthCount, ADMIN_DASHBOARD_TREND_MAX_MONTHS));

  return Array.from({ length: safeCount }, (_, index) => {
    const offsetMonths = -(safeCount - 1 - index);
    const range = getHktMonthRange(offsetMonths);

    return {
      label: formatHktMonthShortLabel(offsetMonths),
      value: sumInRange(rows, range.startIso, range.endIso),
    };
  });
}

/** @deprecated Use buildMonthTrend(rows, 6) */
export function buildLastSixMonthTrend(rows: TrendRow[]): AdminDashboardTrendPoint[] {
  return buildMonthTrend(rows, ADMIN_DASHBOARD_TREND_DEFAULT_MONTHS);
}

export const ADMIN_DASHBOARD_TREND_MONTH_COUNT = ADMIN_DASHBOARD_TREND_MAX_MONTHS;
