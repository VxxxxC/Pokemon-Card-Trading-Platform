"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import {
  categoryBadgeClasses,
  formatCategoryLabel,
  formatModerationDateTime,
} from "@/lib/moderation/admin-case-presenters";
import { highlightSensitiveKeywords } from "@/lib/moderation/highlight-chat-keywords";
import {
  getReportDisplayText,
  parseStructuredReportReason,
} from "@/lib/moderation/parse-report-reason";
import type {
  AdminModerationReportRow,
  ReportCategorySlug,
} from "@/lib/moderation/types";
import {
  META_TEXT_CLASS,
  SECTION_BLOCK_CLASS,
  SECTION_TITLE_CLASS,
  EXPANDED_CONTENT_CLASS,
} from "./moderation-detail-ui";
import { ModerationExpandToggle } from "./ModerationExpandToggle";

const INITIAL_VISIBLE = 3;

type ModerationReportSummaryPanelProps = {
  reports: AdminModerationReportRow[];
  primaryCategory?: ReportCategorySlug | null;
  primaryReporterId?: string | null;
};

function reportSourceLabel(report: AdminModerationReportRow): string {
  if (report.source === "profile") {
    return "公開資料";
  }
  if (report.source === "chat_room") {
    return report.contextId
      ? `對話 · ${report.contextId.slice(0, 8)}`
      : "對話";
  }
  return "未知來源";
}

function isRedundantReportEntry(
  report: AdminModerationReportRow,
  primaryCategory?: ReportCategorySlug | null,
  hideReporterMeta?: boolean,
): boolean {
  const rawText = report.details?.trim() || report.reason;
  const parsed = parseStructuredReportReason(rawText);
  const displayText = getReportDisplayText(report.details, report.reason);
  const showCategoryBadge =
    Boolean(report.category) && report.category !== primaryCategory;

  if (displayText || showCategoryBadge || !hideReporterMeta) {
    return false;
  }

  return parsed.isStructured || Boolean(rawText);
}

function ReportEntry({
  report,
  primaryCategory,
  hideReporterMeta,
}: {
  report: AdminModerationReportRow;
  primaryCategory?: ReportCategorySlug | null;
  hideReporterMeta?: boolean;
}) {
  const rawText = report.details?.trim() || report.reason;
  const parsed = parseStructuredReportReason(rawText);
  const displayText = getReportDisplayText(report.details, report.reason);
  const showCategoryBadge =
    Boolean(report.category) && report.category !== primaryCategory;

  const reporterLabel =
    report.reporterDisplayName ?? report.reporterUsername ?? "未知";
  const reporterHandle =
    report.reporterUsername && report.reporterDisplayName
      ? ` · @${report.reporterUsername}`
      : "";

  return (
    <div className="space-y-1.5 py-2.5 first:pt-0">
      <div className="min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          {showCategoryBadge ? (
            <Badge
              variant="outline"
              className={categoryBadgeClasses(report.category)}
            >
              {formatCategoryLabel(report.category)}
            </Badge>
          ) : null}
          <span className={`${META_TEXT_CLASS} text-text-secondary`}>
            {reportSourceLabel(report)}
          </span>
        </div>
        {!hideReporterMeta ? (
          <p className={META_TEXT_CLASS}>
            {reporterLabel}
            {reporterHandle}
            <span className="text-text-disabled/50"> · </span>
            {formatModerationDateTime(report.createdAt)}
          </p>
        ) : (
          <p className={META_TEXT_CLASS}>
            {formatModerationDateTime(report.createdAt)}
          </p>
        )}
      </div>

      {displayText ? (
        <p className="font-sans text-[13px] leading-relaxed text-text-secondary">
          {highlightSensitiveKeywords(displayText)}
        </p>
      ) : !parsed.isStructured ? (
        <p className={META_TEXT_CLASS}>無補充說明</p>
      ) : null}
    </div>
  );
}

export default function ModerationReportSummaryPanel({
  reports,
  primaryCategory,
  primaryReporterId,
}: ModerationReportSummaryPanelProps) {
  const [expanded, setExpanded] = useState(false);
  const hiddenCount = Math.max(reports.length - INITIAL_VISIBLE, 0);
  const headReports =
    hiddenCount === 0 ? reports : reports.slice(0, INITIAL_VISIBLE);
  const tailReports =
    expanded && hiddenCount > 0 ? reports.slice(INITIAL_VISIBLE) : [];
  const singleReport = reports.length === 1;
  const hideReporterMeta = Boolean(
    singleReport &&
      primaryReporterId &&
      reports[0]?.reporterId === primaryReporterId,
  );

  if (
    singleReport &&
    isRedundantReportEntry(reports[0], primaryCategory, hideReporterMeta)
  ) {
    return null;
  }

  if (reports.length === 0) {
    return (
      <section className={SECTION_BLOCK_CLASS}>
        <h2 className={SECTION_TITLE_CLASS}>舉報摘要</h2>
        <p className={META_TEXT_CLASS}>暫無舉報紀錄。</p>
      </section>
    );
  }

  return (
    <section className={SECTION_BLOCK_CLASS}>
      {!singleReport ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className={SECTION_TITLE_CLASS}>舉報摘要</h2>
          <span className={META_TEXT_CLASS}>共 {reports.length} 條</span>
        </div>
      ) : null}

      <div className={singleReport ? "" : "divide-y divide-white/[0.06]"}>
        {headReports.map((report) => (
          <ReportEntry
            key={report.id}
            report={report}
            primaryCategory={primaryCategory}
            hideReporterMeta={hideReporterMeta}
          />
        ))}
        {tailReports.length > 0 ? (
          <div className={EXPANDED_CONTENT_CLASS}>
            <div className="divide-y divide-white/[0.06]">
              {tailReports.map((report) => (
                <ReportEntry
                  key={report.id}
                  report={report}
                  primaryCategory={primaryCategory}
                  hideReporterMeta={hideReporterMeta}
                />
              ))}
            </div>
          </div>
        ) : null}
        {hiddenCount > 0 ? (
          <div className="flex items-center justify-end gap-2 pt-1">
            {!expanded ? (
              <span className={META_TEXT_CLASS}>其餘 {hiddenCount} 條</span>
            ) : null}
            <ModerationExpandToggle
              open={expanded}
              onToggle={() => setExpanded((value) => !value)}
              label={
                expanded
                  ? "收合舉報"
                  : `展開其餘 ${hiddenCount} 條舉報`
              }
            />
          </div>
        ) : null}
      </div>
    </section>
  );
}
