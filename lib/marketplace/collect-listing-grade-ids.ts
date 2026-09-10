import type { MarketplaceProductListingRow } from "@/app/lib/marketplace/types";
import { resolveGradingOptionId } from "@/lib/grading/resolve-option-id";

export function collectListingGradeOptionIds(
  rows: MarketplaceProductListingRow[],
): Set<string> {
  const ids = new Set<string>();
  for (const row of rows) {
    ids.add(resolveGradingOptionId(row.gradingCompany, row.gradingScore));
  }
  return ids;
}

export function isRawGradingOptionId(optionId: string): boolean {
  return optionId.startsWith("raw:");
}
