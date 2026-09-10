import type { FpsBatchScheduleInfo } from "@/lib/admin-payouts/types";

/**
 * FPS weekly batch schedule — **code SSOT** (not `platform_settings`).
 * `fps_payout_config` DB row was removed; use defaults / `FPS_BATCH_WEEKDAY` env only.
 */
const HKT_TIME_ZONE = "Asia/Hong_Kong";

/** ISO weekday: Monday = 1 … Sunday = 7 */
export const DEFAULT_FPS_BATCH_WEEKDAY = 3;
export const DEFAULT_FPS_CUTOFF_WEEKDAY = 2;

const WEEKDAY_LABELS: Record<number, string> = {
  1: "星期一",
  2: "星期二",
  3: "星期三",
  4: "星期四",
  5: "星期五",
  6: "星期六",
  7: "星期日",
};

export type FpsPayoutConfig = {
  batchWeekday: number;
  cutoffWeekday: number;
  timezone: string;
};

export function resolveFpsBatchWeekday(
  config?: Partial<FpsPayoutConfig> | null,
): number {
  const fromConfig = config?.batchWeekday;
  if (fromConfig && fromConfig >= 1 && fromConfig <= 7) {
    return fromConfig;
  }

  const fromEnv = Number(process.env.FPS_BATCH_WEEKDAY);
  if (Number.isInteger(fromEnv) && fromEnv >= 1 && fromEnv <= 7) {
    return fromEnv;
  }

  return DEFAULT_FPS_BATCH_WEEKDAY;
}

export function resolveFpsCutoffWeekday(
  config?: Partial<FpsPayoutConfig> | null,
): number {
  const fromConfig = config?.cutoffWeekday;
  if (fromConfig && fromConfig >= 1 && fromConfig <= 7) {
    return fromConfig;
  }

  return DEFAULT_FPS_CUTOFF_WEEKDAY;
}

function getHktDateParts(date: Date): { year: number; month: number; day: number } {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: HKT_TIME_ZONE,
    year: "numeric",
    month: "numeric",
    day: "numeric",
  });

  const parts = formatter.formatToParts(date);
  return {
    year: Number(parts.find((part) => part.type === "year")?.value),
    month: Number(parts.find((part) => part.type === "month")?.value),
    day: Number(parts.find((part) => part.type === "day")?.value),
  };
}

function getIsoWeekdayHkt(date: Date): number {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: HKT_TIME_ZONE,
    weekday: "short",
  });
  const weekday = formatter.format(date);
  const map: Record<string, number> = {
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
    Sun: 7,
  };
  return map[weekday] ?? 1;
}

function formatHktDateLabel(year: number, month: number, day: number): string {
  return `${year}/${String(month).padStart(2, "0")}/${String(day).padStart(2, "0")}`;
}

function addDaysHkt(
  year: number,
  month: number,
  day: number,
  deltaDays: number,
): { year: number; month: number; day: number } {
  const utc = Date.UTC(year, month - 1, day, -8, 0, 0, 0);
  const shifted = new Date(utc + deltaDays * 24 * 60 * 60 * 1000);
  return getHktDateParts(shifted);
}

export function getNextBatchSchedule(
  config?: Partial<FpsPayoutConfig> | null,
  now = new Date(),
): FpsBatchScheduleInfo {
  const batchWeekday = resolveFpsBatchWeekday(config);
  const cutoffWeekday = resolveFpsCutoffWeekday(config);
  const today = getHktDateParts(now);
  const todayWeekday = getIsoWeekdayHkt(now);

  let daysUntilBatch = (batchWeekday - todayWeekday + 7) % 7;
  if (daysUntilBatch === 0) {
    daysUntilBatch = 7;
  }

  const nextBatch = addDaysHkt(today.year, today.month, today.day, daysUntilBatch);
  const cutoffOffset = (cutoffWeekday - batchWeekday + 7) % 7;
  const cutoff = addDaysHkt(
    nextBatch.year,
    nextBatch.month,
    nextBatch.day,
    cutoffOffset,
  );

  return {
    batchWeekday,
    batchWeekdayLabel: WEEKDAY_LABELS[batchWeekday] ?? "星期三",
    nextBatchDateLabel: formatHktDateLabel(
      nextBatch.year,
      nextBatch.month,
      nextBatch.day,
    ),
    cutoffLabel: `${formatHktDateLabel(cutoff.year, cutoff.month, cutoff.day)} 23:59 HKT`,
  };
}
