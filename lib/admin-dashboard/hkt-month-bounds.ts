const HKT_TIME_ZONE = "Asia/Hong_Kong";

type HktDateParts = {
  year: number;
  month: number;
};

function getHktDateParts(date: Date): HktDateParts {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: HKT_TIME_ZONE,
    year: "numeric",
    month: "numeric",
  });

  const parts = formatter.formatToParts(date);
  const year = Number(parts.find((part) => part.type === "year")?.value);
  const month = Number(parts.find((part) => part.type === "month")?.value);

  return { year, month };
}

function toUtcIsoFromHkt(year: number, month: number, day: number): string {
  // HKT is UTC+8 with no DST.
  return new Date(Date.UTC(year, month - 1, day, -8, 0, 0, 0)).toISOString();
}

function shiftHktMonth(parts: HktDateParts, offsetMonths: number): HktDateParts {
  const zeroBased = parts.year * 12 + (parts.month - 1) + offsetMonths;
  return {
    year: Math.floor(zeroBased / 12),
    month: (zeroBased % 12) + 1,
  };
}

export function getHktMonthRange(offsetMonths = 0): {
  startIso: string;
  endIso: string;
} {
  const current = shiftHktMonth(getHktDateParts(new Date()), offsetMonths);
  const next = shiftHktMonth(current, 1);

  return {
    startIso: toUtcIsoFromHkt(current.year, current.month, 1),
    endIso: toUtcIsoFromHkt(next.year, next.month, 1),
  };
}

export function getHktRollingWindowStartIso(days: number): string {
  const now = Date.now();
  return new Date(now - days * 24 * 60 * 60 * 1000).toISOString();
}
