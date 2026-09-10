/** Display helpers for marketplace listing rows. */
import {
  formatSealedProductLabel,
  isSealedProductGrade,
} from "@/lib/catalog/item-kind";

export function formatListingGrade(
  company: string,
  score: string | null,
): { authority: string; score: string } {
  if (isSealedProductGrade(company, score)) {
    return { authority: formatSealedProductLabel(company, score), score: "" };
  }

  const normalized = company.toUpperCase().trim();
  const trimmedScore = score?.trim() ?? "";
  if (normalized === "RAW" || normalized === "RAW CARD") {
    return { authority: "Raw Card", score: trimmedScore };
  }
  return { authority: company, score: trimmedScore };
}

export function formatTradeGradeLabel(
  company: string,
  score: string | null,
): string {
  if (isSealedProductGrade(company, score)) {
    return formatSealedProductLabel(company, score);
  }

  const { authority, score: gradeScore } = formatListingGrade(company, score);
  if (authority === "Raw Card") {
    return gradeScore ? `裸卡 ${gradeScore}` : "裸卡";
  }
  return gradeScore ? `${authority} ${gradeScore}` : authority;
}

const RELATIVE_TIME_FORMATTER = new Intl.RelativeTimeFormat("zh-Hant", {
  numeric: "always",
});

/** Relative order/trade timestamp: 剛剛 → 分鐘 → 小時 → 天 → 月 → 年 */
export function formatRelativeDateTime(
  createdAt: string | null | undefined,
  now: Date = new Date(),
): string {
  if (!createdAt) return "—";

  const then = new Date(createdAt);
  if (Number.isNaN(then.getTime())) return "—";

  const elapsedMs = now.getTime() - then.getTime();
  if (elapsedMs < 0) return "剛剛";

  const minuteMs = 60_000;
  const hourMs = 60 * minuteMs;
  const dayMs = 24 * hourMs;
  const monthMs = 30 * dayMs;
  const yearMs = 365 * dayMs;

  if (elapsedMs < minuteMs) return "剛剛";
  if (elapsedMs < hourMs) {
    return RELATIVE_TIME_FORMATTER.format(
      -Math.floor(elapsedMs / minuteMs),
      "minute",
    );
  }
  if (elapsedMs < dayMs) {
    return RELATIVE_TIME_FORMATTER.format(
      -Math.floor(elapsedMs / hourMs),
      "hour",
    );
  }
  if (elapsedMs < monthMs) {
    return RELATIVE_TIME_FORMATTER.format(
      -Math.floor(elapsedMs / dayMs),
      "day",
    );
  }
  if (elapsedMs < yearMs) {
    return RELATIVE_TIME_FORMATTER.format(
      -Math.floor(elapsedMs / monthMs),
      "month",
    );
  }
  return RELATIVE_TIME_FORMATTER.format(
    -Math.floor(elapsedMs / yearMs),
    "year",
  );
}
