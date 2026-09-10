"use client";

import Link from "next/link";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import {
  formatCategoryLabel,
  formatModerationDateTime,
  moderationResolutionLabel,
  moderationStatusLabel,
  sanctionHistoryStatusLabel,
  sanctionScopeLabel,
  sanctionTypeLabel,
} from "@/lib/moderation/admin-case-presenters";
import type { AdminSubjectModerationHistory } from "@/lib/moderation/types";
import { ModerationExpandToggle } from "./ModerationExpandToggle";
import { SECTION_BLOCK_CLASS, SECTION_TITLE_CLASS, META_TEXT_CLASS, EXPANDED_CONTENT_CLASS } from "./moderation-detail-ui";

type ModerationSubjectHistoryPanelProps = {
  history: AdminSubjectModerationHistory;
  currentFinalScore: number | null;
};

export default function ModerationSubjectHistoryPanel({
  history,
  currentFinalScore,
}: ModerationSubjectHistoryPanelProps) {
  const { stats, priorCases, sanctionHistory } = history;
  const defaultOpen =
    stats.upheldCount > 0 || stats.priorCaseCount > 0;
  const [open, setOpen] = useState(defaultOpen);
  const showRepeatHint =
    (currentFinalScore ?? 0) >= 30 && stats.upheldCount >= 1;

  return (
    <section className={SECTION_BLOCK_CLASS}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h2 className={SECTION_TITLE_CLASS}>被舉報人歷史檔案</h2>
          {open ? (
            <p className={`mt-0.5 ${META_TEXT_CLASS}`}>
              歷史參考 — 不影響本案風控分數
            </p>
          ) : null}
        </div>
        <ModerationExpandToggle
          open={open}
          onToggle={() => setOpen((value) => !value)}
        />
      </div>

      {stats.upheldCount >= 1 || stats.priorCaseCount >= 1 ? (
        <div className="mt-3">
          <Badge
            variant="outline"
            className="bg-[rgba(245,158,11,0.12)] text-[#f59e0b] border-[#f59e0b]/20"
          >
            曾有違規紀錄
          </Badge>
        </div>
      ) : null}

      {showRepeatHint ? (
        <p className="font-sans text-[12px] text-warning">
          建議：被舉報人曾有成立裁定，可考慮加重制裁（仍須 Admin 手動選擇）。
        </p>
      ) : null}

      {open ? (
        <div className={`${EXPANDED_CONTENT_CLASS} space-y-4`}>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="歷史案件" value={stats.priorCaseCount} />
            <Stat label="裁定成立" value={stats.upheldCount} />
            <Stat label="近 90 日舉報" value={stats.reportsLast90Days} />
            <Stat label="曾受制裁類型" value={stats.distinctSanctionTypes.length} />
          </div>

          <div>
            <h3 className={SECTION_TITLE_CLASS}>
              歷史案件
            </h3>
            {priorCases.length === 0 ? (
              <p className="mt-2 font-sans text-[12px] text-text-disabled">
                無其他歷史案件。
              </p>
            ) : (
              <div className="mt-2 overflow-x-auto">
                <table className="min-w-full font-sans text-[12px] text-text-secondary">
                  <thead>
                    <tr className="text-left text-text-disabled">
                      <th className="py-2 pr-3">案件編號</th>
                      <th className="py-2 pr-3">狀態</th>
                      <th className="py-2 pr-3">類別</th>
                      <th className="py-2 pr-3">分數</th>
                      <th className="py-2 pr-3">裁定</th>
                      <th className="py-2">結案時間</th>
                    </tr>
                  </thead>
                  <tbody>
                    {priorCases.map((priorCase) => (
                      <tr key={priorCase.id} className="border-t border-white/[0.06]">
                        <td className="py-2 pr-3">
                          <Link
                            href={`/admin/disputes/${priorCase.id}`}
                            className="font-mono text-brand hover:underline"
                          >
                            {priorCase.caseNumber}
                          </Link>
                        </td>
                        <td className="py-2 pr-3">
                          {moderationStatusLabel(priorCase.status)}
                        </td>
                        <td className="py-2 pr-3">
                          {formatCategoryLabel(priorCase.primaryCategory)}
                        </td>
                        <td className="py-2 pr-3">{priorCase.finalScore ?? "—"}</td>
                        <td className="py-2 pr-3">
                          {moderationResolutionLabel(priorCase.resolution)}
                        </td>
                        <td className="py-2">
                          {priorCase.resolvedAt
                            ? formatModerationDateTime(priorCase.resolvedAt)
                            : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div>
            <h3 className={SECTION_TITLE_CLASS}>
              制裁紀錄
            </h3>
            {sanctionHistory.length === 0 ? (
              <p className="mt-2 font-sans text-[12px] text-text-disabled">
                無制裁紀錄。
              </p>
            ) : (
              <div className="mt-2 overflow-x-auto">
                <table className="min-w-full font-sans text-[12px] text-text-secondary">
                  <thead>
                    <tr className="text-left text-text-disabled">
                      <th className="py-2 pr-3">類型</th>
                      <th className="py-2 pr-3">來源案件</th>
                      <th className="py-2 pr-3">開始</th>
                      <th className="py-2 pr-3">結束</th>
                      <th className="py-2 pr-3">狀態</th>
                      <th className="py-2">原因</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sanctionHistory.map((sanction) => (
                      <tr key={sanction.id} className="border-t border-white/[0.06]">
                        <td className="py-2 pr-3">
                          {sanctionScopeLabel(sanction.scope)} ·{" "}
                          {sanctionTypeLabel(sanction.type)}
                        </td>
                        <td className="py-2 pr-3">
                          {sanction.caseId && sanction.caseNumber ? (
                            <Link
                              href={`/admin/disputes/${sanction.caseId}`}
                              className="font-mono text-brand hover:underline"
                            >
                              {sanction.caseNumber}
                            </Link>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="py-2 pr-3">
                          {formatModerationDateTime(sanction.startsAt)}
                        </td>
                        <td className="py-2 pr-3">
                          {sanction.endsAt
                            ? formatModerationDateTime(sanction.endsAt)
                            : "永久"}
                        </td>
                        <td className="py-2 pr-3">
                          {sanctionHistoryStatusLabel(sanction.status)}
                        </td>
                        <td className="py-2">{sanction.reason ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="py-1">
      <p className="font-sans text-[11px] text-text-disabled">{label}</p>
      <p className="mt-0.5 font-mono text-[15px] font-semibold text-text-primary">
        {value}
      </p>
    </div>
  );
}
