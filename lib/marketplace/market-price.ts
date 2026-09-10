import type { MarketplaceMarketPriceGradeRow } from "@/app/lib/marketplace/types";
import {
  formatSealedProductLabel,
  isSealedProductGrade,
  normalizeSealedProductScore,
  sealedProductGradingOptionId,
} from "@/lib/catalog/item-kind";
import {
  DEFAULT_GRADING_OPTION_ID,
  GRADING_OPTIONS,
  getGradingOption,
  normalizeGradingCompany,
  OTHER_GRADING_OPTION_ID,
  type RawCondition,
} from "@/lib/grading/options";

/** Legacy cron placeholder when raw condition is unknown. */
export const RAW_MARKET_PRICE_GRADING_SCORE = "-";

/** Snapshot ingest value for professionally graded (non-裸卡) sales. */
export const GRADED_CONDITION_TYPE = "other_grading";

export const RAW_CONDITION_CODES = ["A", "B", "C", "D"] as const;

export function isGradedConditionType(
  conditionType: string | null | undefined,
): boolean {
  return (conditionType ?? "").trim().toLowerCase() === GRADED_CONDITION_TYPE;
}

export function isRawConditionCode(value: string): value is RawCondition {
  return RAW_CONDITION_CODES.includes(value.toUpperCase() as RawCondition);
}

export function normalizeMarketPriceGradingScore(
  score: string | null | undefined,
): string {
  const trimmed = (score ?? "").trim();
  return trimmed.length > 0 ? trimmed : RAW_MARKET_PRICE_GRADING_SCORE;
}

/** Resolve cache `grading_score` for RAW rows from snapshot fields. */
export function normalizeRawMarketPriceScore(
  gradingScore: string | null | undefined,
  conditionType: string | null | undefined,
): string {
  const trimmedScore = (gradingScore ?? "").trim();
  if (trimmedScore && isRawConditionCode(trimmedScore)) {
    return trimmedScore.toUpperCase();
  }

  const trimmedCondition = (conditionType ?? "").trim();
  if (trimmedCondition && isRawConditionCode(trimmedCondition)) {
    return trimmedCondition.toUpperCase();
  }

  return RAW_MARKET_PRICE_GRADING_SCORE;
}

/** Resolve cache `grading_company` from snapshot fields. */
export function resolveMarketPriceDbCompany(
  gradingCompany: string | null | undefined,
  conditionType?: string | null,
): string {
  const trimmedCompany = (gradingCompany ?? "").trim();
  const normalized = trimmedCompany
    ? normalizeGradingCompany(trimmedCompany)
    : null;

  if (isGradedConditionType(conditionType)) {
    if (!normalized || normalized === "RAW") {
      return "OTHER";
    }
    return normalized;
  }

  if (normalized && normalized !== "RAW") {
    return normalized;
  }

  return normalized ?? "RAW";
}

export function resolveMarketPriceDbScore(
  gradingCompany: string | null | undefined,
  gradingScore: string | null | undefined,
  conditionType?: string | null,
): string {
  const company = resolveMarketPriceDbCompany(gradingCompany, conditionType);

  if (company === "RAW") {
    return normalizeRawMarketPriceScore(gradingScore, conditionType);
  }

  return normalizeMarketPriceGradingScore(gradingScore);
}

export function rawConditionFromMarketPriceScore(
  gradingScore: string,
): RawCondition | null {
  const trimmed = gradingScore.trim();
  if (isRawConditionCode(trimmed)) {
    return trimmed.toUpperCase() as RawCondition;
  }
  return null;
}

export function dbGradingScoreToOptionScore(
  gradingCompany: string,
  gradingScore: string,
): string | null {
  const company = normalizeGradingCompany(gradingCompany);

  if (company === "RAW") {
    return rawConditionFromMarketPriceScore(gradingScore);
  }

  const trimmed = gradingScore.trim();
  if (!trimmed || trimmed === RAW_MARKET_PRICE_GRADING_SCORE) {
    return null;
  }

  return trimmed;
}

function gradingOptionLabelFromMarketPriceRow(
  gradingCompany: string,
  gradingScore: string,
): string | null {
  const optionId = matchGradeOptionIdFromMarketPriceRow(
    gradingCompany,
    gradingScore,
  );
  if (!optionId) {
    return null;
  }

  const option = GRADING_OPTIONS.find((entry) => entry.id === optionId);
  return option?.label ?? null;
}

export function formatMarketGradeLabel(
  gradingCompany: string,
  gradingScore: string,
): string {
  if (isSealedProductGrade(gradingCompany, gradingScore)) {
    return formatSealedProductLabel(gradingCompany, gradingScore);
  }

  const company = normalizeGradingCompany(gradingCompany);
  const rawCondition = rawConditionFromMarketPriceScore(gradingScore);

  if (company === "RAW") {
    const optionLabel = gradingOptionLabelFromMarketPriceRow(
      gradingCompany,
      gradingScore,
    );
    if (optionLabel) {
      return optionLabel;
    }
    return rawCondition ? `裸卡 ${rawCondition}` : "裸卡";
  }

  if (company === "OTHER") {
    const optionScore = dbGradingScoreToOptionScore(company, gradingScore);
    return optionScore ? `其他鑑定 ${optionScore}` : "其他鑑定";
  }

  const optionLabel = gradingOptionLabelFromMarketPriceRow(
    gradingCompany,
    gradingScore,
  );
  if (optionLabel) {
    return optionLabel;
  }

  const optionScore = dbGradingScoreToOptionScore(company, gradingScore);
  if (optionScore) {
    return `${company} ${optionScore}`;
  }

  return company;
}

export function matchGradeOptionIdFromMarketPriceRow(
  gradingCompany: string,
  gradingScore: string,
): string | null {
  const company = normalizeGradingCompany(gradingCompany);
  const rawCondition = rawConditionFromMarketPriceScore(gradingScore);

  if (company === "RAW") {
    if (rawCondition) {
      return `raw:${rawCondition}`;
    }

    if (gradingScore.trim() === RAW_MARKET_PRICE_GRADING_SCORE) {
      return GRADING_OPTIONS.find((option) => option.company === "RAW")?.id ?? null;
    }

    return null;
  }

  if (isSealedProductGrade(gradingCompany, gradingScore)) {
    return sealedProductGradingOptionId(
      normalizeSealedProductScore(gradingCompany, gradingScore),
    );
  }

  if (company === "OTHER") {
    return OTHER_GRADING_OPTION_ID;
  }

  const optionScore = dbGradingScoreToOptionScore(company, gradingScore);

  const match = GRADING_OPTIONS.find(
    (option) =>
      normalizeGradingCompany(option.company) === company &&
      option.score === optionScore,
  );

  return match?.id ?? null;
}

export function buildMarketPriceGradeKey(
  gradingCompany: string,
  gradingScore: string,
): string {
  const optionId = matchGradeOptionIdFromMarketPriceRow(
    gradingCompany,
    gradingScore,
  );
  if (optionId) {
    return optionId;
  }

  return `${normalizeGradingCompany(gradingCompany)}:${gradingScore}`;
}

const gradingOptionSortIndex = new Map(
  GRADING_OPTIONS.map((option, index) => [option.id, index]),
);

for (const [index, sealKey] of ["sealed:SEALED", "sealed:UNSEALED"].entries()) {
  gradingOptionSortIndex.set(sealKey, GRADING_OPTIONS.length + index);
}

export function sortMarketPriceGradeRows(
  rows: MarketplaceMarketPriceGradeRow[],
): MarketplaceMarketPriceGradeRow[] {
  return [...rows].sort((left, right) => {
    const leftIndex = gradingOptionSortIndex.get(left.gradeKey) ?? 9999;
    const rightIndex = gradingOptionSortIndex.get(right.gradeKey) ?? 9999;

    if (leftIndex !== rightIndex) {
      return leftIndex - rightIndex;
    }

    return left.label.localeCompare(right.label, "en");
  });
}

export function pickDefaultMarketPriceGradeKey(
  gradeKeys: string[],
): string | null {
  if (gradeKeys.length === 0) {
    return null;
  }

  if (gradeKeys.includes(DEFAULT_GRADING_OPTION_ID)) {
    return DEFAULT_GRADING_OPTION_ID;
  }

  return gradeKeys[0] ?? null;
}

/** Grade keys for single-row `product_grading_market_prices` lookup. */
export function resolveMarketPriceGradeFromFilter(selectedGradeFilterId: string): {
  gradingCompany: string;
  gradingScore: string | null;
  conditionType: string | null;
} {
  const option =
    selectedGradeFilterId === "ALL"
      ? getGradingOption(DEFAULT_GRADING_OPTION_ID)
      : getGradingOption(selectedGradeFilterId);

  if (option.company === "RAW") {
    return {
      gradingCompany: "RAW",
      gradingScore: option.condition,
      conditionType: option.condition,
    };
  }

  return {
    gradingCompany: normalizeGradingCompany(option.company),
    gradingScore: option.score,
    conditionType: null,
  };
}

export function resolveMarketPriceDbScoreFromFilter(
  selectedGradeFilterId: string,
): {
  gradingCompany: string;
  gradingScore: string;
} {
  const { gradingCompany, gradingScore, conditionType } =
    resolveMarketPriceGradeFromFilter(selectedGradeFilterId);

  return {
    gradingCompany,
    gradingScore: resolveMarketPriceDbScore(
      gradingCompany,
      gradingScore,
      conditionType,
    ),
  };
}
