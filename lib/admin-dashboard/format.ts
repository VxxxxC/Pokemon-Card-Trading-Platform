export function formatHkd(value: number): string {
  return `HK$ ${value.toLocaleString("en-HK", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;
}

export function formatIntegerCount(value: number): string {
  return value.toLocaleString("en-HK");
}

export function formatCountWithUnit(value: number, unit: string): string {
  return `${formatIntegerCount(value)} ${unit}`;
}

export function formatGrowthPct(
  current: number,
  previous: number,
): string | null {
  if (previous === 0) {
    return null;
  }

  const pct = ((current - previous) / previous) * 100;
  const sign = pct >= 0 ? "+" : "−";
  return `${sign}${Math.abs(pct).toFixed(1)}%`;
}

export function formatPercentRate(rate: number): string {
  return `${(rate * 100).toFixed(1)}%`;
}

export function sumInRange(
  values: { amount: number; recognizedAt: string | null }[],
  startIso: string,
  endIso: string,
): number {
  const startMs = Date.parse(startIso);
  const endMs = Date.parse(endIso);

  return values.reduce((total, row) => {
    if (!row.recognizedAt) {
      return total;
    }

    const recognizedMs = Date.parse(row.recognizedAt);
    if (Number.isNaN(recognizedMs)) {
      return total;
    }

    if (recognizedMs >= startMs && recognizedMs < endMs) {
      return total + row.amount;
    }

    return total;
  }, 0);
}

export function countInRange(
  recognizedAts: (string | null)[],
  startIso: string,
  endIso: string,
): number {
  const startMs = Date.parse(startIso);
  const endMs = Date.parse(endIso);

  return recognizedAts.reduce((total, recognizedAt) => {
    if (!recognizedAt) {
      return total;
    }

    const recognizedMs = Date.parse(recognizedAt);
    if (Number.isNaN(recognizedMs)) {
      return total;
    }

    if (recognizedMs >= startMs && recognizedMs < endMs) {
      return total + 1;
    }

    return total;
  }, 0);
}
