export const REPORT_CATEGORY_SLUGS = [
  "fraud",
  "offline_trade",
  "harassment",
  "other",
] as const;

export type ReportCategorySlug = (typeof REPORT_CATEGORY_SLUGS)[number];

export type ReportEvidenceLevel = "required" | "recommended" | "optional" | "none";

export type ReportCategoryConfig = {
  slug: ReportCategorySlug;
  label: string;
  baseWeight: number;
  evidence: {
    upload: ReportEvidenceLevel;
    chat: ReportEvidenceLevel;
    order: ReportEvidenceLevel;
  };
  userHint: string;
  adminHint: string;
};

export const REPORT_CATEGORY_CONFIG: Record<
  ReportCategorySlug,
  ReportCategoryConfig
> = {
  fraud: {
    slug: "fraud",
    label: "惡意欺詐 / 虛假交易",
    baseWeight: 40,
    evidence: {
      upload: "recommended",
      chat: "optional",
      order: "recommended",
    },
    userHint: "建議附上交易截圖及訂單編號（如有）。",
    adminHint: "核對訂單狀態、付款紀錄與對話是否一致。",
  },
  offline_trade: {
    slug: "offline_trade",
    label: "誘導私下交易",
    baseWeight: 30,
    evidence: {
      upload: "recommended",
      chat: "required",
      order: "none",
    },
    userHint: "請在對話視窗內舉報，以便調閱完整聊天紀錄。",
    adminHint: "必須調閱對話紀錄，檢查是否出現站外付款或聯絡方式。",
  },
  harassment: {
    slug: "harassment",
    label: "言語辱罵 / 不當言論",
    baseWeight: 15,
    evidence: {
      upload: "optional",
      chat: "required",
      order: "none",
    },
    userHint: "請在對話視窗內舉報，以便調閱完整聊天紀錄。",
    adminHint: "必須調閱對話紀錄，確認辱罵或騷擾內容。",
  },
  other: {
    slug: "other",
    label: "其他違規行為",
    baseWeight: 10,
    evidence: {
      upload: "optional",
      chat: "optional",
      order: "none",
    },
    userHint: "請盡量描述具體違規事實，方便風控審核。",
    adminHint: "依敘述與附帶證據綜合判斷。",
  },
};

const LABEL_TO_SLUG = new Map<string, ReportCategorySlug>(
  REPORT_CATEGORY_SLUGS.map((slug) => [
    REPORT_CATEGORY_CONFIG[slug].label,
    slug,
  ]),
);

export function isReportCategorySlug(
  value: string,
): value is ReportCategorySlug {
  return (REPORT_CATEGORY_SLUGS as readonly string[]).includes(value);
}

export function resolveReportCategoryInput(
  input: string,
): ReportCategorySlug | null {
  const trimmed = input.trim();
  if (!trimmed) {
    return null;
  }

  if (isReportCategorySlug(trimmed)) {
    return trimmed;
  }

  return LABEL_TO_SLUG.get(trimmed) ?? null;
}

export function isChatEvidenceRequiredForCategory(
  slug: ReportCategorySlug,
): boolean {
  return REPORT_CATEGORY_CONFIG[slug].evidence.chat === "required";
}
