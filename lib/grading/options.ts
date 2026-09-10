/** Grading companies supported for single-card listings. */
export const GRADING_COMPANIES = ["PSA", "CGC", "BGS", "ARS"] as const;

/** First-party graders shown explicitly in filters; everything else is OTHER. */
export const FIRST_PARTY_GRADING_COMPANIES = [
  ...GRADING_COMPANIES,
  "RAW",
] as const;

export type GradingCompany =
  | (typeof GRADING_COMPANIES)[number]
  | "RAW"
  | "OTHER";

export const OTHER_GRADING_OPTION_ID = "other";

export type RawCondition = "A" | "B" | "C" | "D";

export const RAW_CONDITIONS: readonly {
  value: RawCondition;
  label: string;
}[] = [
  { value: "A", label: "美品" },
  { value: "B", label: "微傷" },
  { value: "C", label: "有傷" },
  { value: "D", label: "重傷" },
] as const;

const PSA_SCORES = ["10", "9", "8", "7", "6", "5", "4", "3", "2", "1"] as const;

const ARS_SCORES = [
  "10+",
  "10",
  "9",
  "8",
  "7",
  "6",
  "5",
  "4",
  "3",
  "2",
  "1",
] as const;

const BGS_SCORES = [
  { value: "10 (Black Label)", shortLabel: "10 黑" },
  { value: "10 (Pristine)", shortLabel: "10" },
  { value: "9.5", shortLabel: "9.5" },
  { value: "9.0", shortLabel: "9" },
  { value: "8.5", shortLabel: "8.5" },
  { value: "8.0", shortLabel: "8" },
  { value: "7.5", shortLabel: "7.5" },
  { value: "7.0", shortLabel: "7" },
  { value: "6.5", shortLabel: "6.5" },
  { value: "6.0", shortLabel: "6" },
  { value: "5.0", shortLabel: "5" },
  { value: "4.0", shortLabel: "4" },
  { value: "3.0", shortLabel: "3" },
  { value: "2.0", shortLabel: "2" },
  { value: "1.0", shortLabel: "1" },
] as const;

const CGC_SCORES = [
  { value: "10 (Pristine)", shortLabel: "10 完美" },
  { value: "10 (Gem Mint)", shortLabel: "10" },
  { value: "9.5", shortLabel: "9.5" },
  { value: "9.0", shortLabel: "9" },
  { value: "8.5", shortLabel: "8.5" },
  { value: "8.0", shortLabel: "8" },
  { value: "7.5", shortLabel: "7.5" },
  { value: "7.0", shortLabel: "7" },
  { value: "6.5", shortLabel: "6.5" },
  { value: "6.0", shortLabel: "6" },
  { value: "5.0", shortLabel: "5" },
  { value: "4.0", shortLabel: "4" },
  { value: "3.0", shortLabel: "3" },
  { value: "2.0", shortLabel: "2" },
  { value: "1.0", shortLabel: "1" },
] as const;

export interface GradingOption {
  /** Stable select value, e.g. `psa:10`, `bgs:10 (Black Label)`, `raw:A` */
  id: string;
  /** UI label, e.g. `PSA 10`, `BGS 10 黑`, `裸卡 A` */
  label: string;
  company: GradingCompany;
  score: string | null;
  condition: RawCondition;
  group: "PSA" | "CGC" | "BGS" | "ARS" | "RAW" | "OTHER";
}

function gradedId(company: string, score: string): string {
  return `${company.toLowerCase()}:${score}`;
}

function buildGradedOptions(
  company: "PSA" | "CGC" | "BGS" | "ARS",
  scores: readonly string[] | readonly { value: string; shortLabel: string }[],
): GradingOption[] {
  return scores.map((entry) => {
    const score = typeof entry === "string" ? entry : entry.value;
    const displayScore = typeof entry === "string" ? entry : entry.shortLabel;
    return {
      id: gradedId(company, score),
      label: `${company} ${displayScore}`,
      company,
      score,
      condition: "A" as RawCondition,
      group: company,
    };
  });
}

function buildRawOptions(): GradingOption[] {
  return RAW_CONDITIONS.map(({ value, label: _label }) => ({
    id: `raw:${value}`,
    label: `裸卡 ${value}`,
    company: "RAW" as const,
    score: null,
    condition: value,
    group: "RAW" as const,
  }));
}

function buildOtherGradingOption(): GradingOption {
  return {
    id: OTHER_GRADING_OPTION_ID,
    label: "其他鑑定",
    company: "OTHER",
    score: null,
    condition: "A",
    group: "OTHER",
  };
}

export const GRADING_OPTIONS: GradingOption[] = [
  ...buildGradedOptions("PSA", PSA_SCORES),
  ...buildGradedOptions("BGS", BGS_SCORES),
  ...buildGradedOptions("CGC", CGC_SCORES),
  ...buildGradedOptions("ARS", ARS_SCORES),
  ...buildRawOptions(),
  buildOtherGradingOption(),
];

export const DEFAULT_GRADING_OPTION_ID = gradedId("PSA", "10");

export const GRADING_OPTION_GROUPS: {
  key: GradingOption["group"];
  label: string;
}[] = [
  { key: "PSA", label: "PSA" },
  { key: "BGS", label: "BGS" },
  { key: "CGC", label: "CGC" },
  { key: "ARS", label: "ARS" },
  { key: "RAW", label: "裸卡" },
  { key: "OTHER", label: "其他" },
];

const gradingOptionById = new Map(
  GRADING_OPTIONS.map((option) => [option.id, option]),
);

export function hasGradingOption(id: string): boolean {
  return gradingOptionById.has(id);
}

export function getGradingOption(id: string): GradingOption {
  return gradingOptionById.get(id) ?? gradingOptionById.get(DEFAULT_GRADING_OPTION_ID)!;
}

/** True when the listing grade is 裸卡 (A–D); platform auth add-on only applies to raw cards. */
export function isRawGradingOption(option: GradingOption): boolean {
  return option.group === "RAW";
}

export function isRawGradingOptionId(id: string): boolean {
  const option = gradingOptionById.get(id);
  return option != null && isRawGradingOption(option);
}

/** Platform auth pass: all graded options (PSA/BGS/CGC/ARS/OTHER), excluding 裸卡. */
export function getAuthPassGradingOptions(): GradingOption[] {
  return GRADING_OPTIONS.filter((option) => option.group !== "RAW");
}

export function isAuthPassGradingOptionId(id: string): boolean {
  const option = gradingOptionById.get(id);
  return option != null && option.group !== "RAW";
}

export function getGradingOptionsByGroup(
  group: GradingOption["group"],
): GradingOption[] {
  return GRADING_OPTIONS.filter((option) => option.group === group);
}

export function normalizeGradingCompany(company: string): string {
  const upper = company.toUpperCase().trim();
  if (upper === "RAW CARD" || upper === "RAW") return "RAW";
  return upper;
}

export function isFirstPartyGradingCompany(company: string): boolean {
  const normalized = normalizeGradingCompany(company);
  return (FIRST_PARTY_GRADING_COMPANIES as readonly string[]).includes(
    normalized,
  );
}

export function isOtherGradingCompany(company: string): boolean {
  return !isFirstPartyGradingCompany(company);
}

export function matchesGradeFilter(
  gradingCompany: string,
  gradingScore: string | null | undefined,
  filterId: string,
): boolean {
  if (!hasGradingOption(filterId)) return false;

  const option = getGradingOption(filterId);
  const normalizedCompany = normalizeGradingCompany(gradingCompany);

  if (option.company === "OTHER") {
    return isOtherGradingCompany(gradingCompany);
  }

  if (normalizedCompany !== option.company.toUpperCase()) return false;
  if (option.score === null) return true;

  return (gradingScore ?? "").trim() === option.score;
}

export function matchesAnyGradeFilter(
  gradingCompany: string,
  gradingScore: string | null | undefined,
  filterIds: string[],
): boolean {
  if (filterIds.length === 0) return true;
  return filterIds.some((id) =>
    matchesGradeFilter(gradingCompany, gradingScore, id),
  );
}

/** Maps a unified grading pick to listing / payload fields. */
export function gradingOptionToFields(option: GradingOption): {
  grader: GradingCompany;
  gradeScore: string | null;
  condition: RawCondition;
  gradeLabel: string;
} {
  if (option.company === "RAW") {
    return {
      grader: "RAW",
      gradeScore: null,
      condition: option.condition,
      gradeLabel: option.label,
    };
  }

  if (option.company === "OTHER") {
    return {
      grader: "OTHER",
      gradeScore: null,
      condition: option.condition,
      gradeLabel: option.label,
    };
  }

  return {
    grader: option.company,
    gradeScore: option.score,
    condition: option.condition,
    gradeLabel: option.label,
  };
}
