"use client";

import { useState } from "react";
import {
  formatModerationDateTime,
  moderationAuditActionLabel,
} from "@/lib/moderation/admin-case-presenters";
import type { AdminModerationAuditRow } from "@/lib/moderation/types";
import { ModerationExpandToggle } from "./ModerationExpandToggle";
import { SECTION_BLOCK_CLASS, SECTION_TITLE_CLASS, META_TEXT_CLASS, EXPANDED_CONTENT_CLASS } from "./moderation-detail-ui";

type ModerationAuditTimelineProps = {
  entries: AdminModerationAuditRow[];
};

export default function ModerationAuditTimeline({
  entries,
}: ModerationAuditTimelineProps) {
  const [open, setOpen] = useState(false);

  return (
    <section className={SECTION_BLOCK_CLASS}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className={SECTION_TITLE_CLASS}>審計紀錄</h2>
        {entries.length > 0 ? (
          <div className="flex items-center gap-3">
            <span className={META_TEXT_CLASS}>共 {entries.length} 筆</span>
            <ModerationExpandToggle
              open={open}
              onToggle={() => setOpen((value) => !value)}
            />
          </div>
        ) : null}
      </div>

      {entries.length === 0 ? (
        <p className="font-sans text-[12px] text-text-disabled">尚無審計紀錄。</p>
      ) : open ? (
        <ol className={`${EXPANDED_CONTENT_CLASS} relative space-y-0`}>
          {entries.map((entry, index) => {
            const isLast = index === entries.length - 1;
            return (
              <li key={entry.id} className="relative flex gap-3 pb-4 last:pb-0">
                {!isLast ? (
                  <span
                    className="absolute left-[5px] top-3 h-[calc(100%-4px)] w-px bg-white/10"
                    aria-hidden="true"
                  />
                ) : null}
                <span
                  className="relative z-[1] mt-1.5 size-2.5 shrink-0 rounded-full border border-brand/40 bg-brand/20"
                  aria-hidden="true"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    <span className="font-sans text-[12px] font-medium text-text-primary">
                      {moderationAuditActionLabel(entry.action)}
                    </span>
                    <span className="font-sans text-[11px] text-text-disabled">
                      {entry.adminDisplayName ?? entry.adminId}
                    </span>
                  </div>
                  <p className="mt-0.5 font-mono text-[11px] text-text-disabled">
                    {formatModerationDateTime(entry.createdAt)}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      ) : null}
    </section>
  );
}
