"use client";

import Link from "next/link";
import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  BTN_OUTLINE_SM_CLASS,
  BTN_PRIMARY_SM_CLASS,
  FORM_SWITCH_CLASS,
} from "@/app/admin/campaigns/campaigns-ui";
import type { AdminRewardActivityRow, AdminRewardActivityStatus } from "@/lib/admin-rewards/types";
import {
  DISPLAY_STATUS_LABELS,
  DISTRIBUTION_MODE_LABELS,
  formatActivityIdShort,
  formatActivityStock,
  formatActivityValidityPeriod,
  formatRewardActivityValue,
  formatTriggerConditionLabel,
  TYPE_LABELS,
} from "@/lib/admin-rewards/template-form";

type RewardActivityCardProps = {
  row: AdminRewardActivityRow;
  disabled?: boolean;
  onStatusChange: (
    row: AdminRewardActivityRow,
    status: AdminRewardActivityStatus,
  ) => void;
};

function statusBadge(displayStatus: string) {
  switch (displayStatus) {
    case "active":
      return <Badge variant="success">進行中</Badge>;
    case "paused":
      return (
        <Badge
          variant="outline"
          className="border-amber-500/40 text-amber-500 bg-amber-500/10 font-mono text-[10px]"
        >
          已暫停
        </Badge>
      );
    case "ended":
      return (
        <Badge variant="default" className="text-text-disabled">
          已結束
        </Badge>
      );
    case "draft":
      return (
        <Badge variant="outline" className="font-mono text-[10px]">
          草稿
        </Badge>
      );
    case "archived":
      return (
        <Badge variant="default" className="text-text-disabled">
          已封存
        </Badge>
      );
    default:
      return (
        <Badge variant="ghost">
          {DISPLAY_STATUS_LABELS[displayStatus] ?? displayStatus}
        </Badge>
      );
  }
}

function showFlashSwitch(row: AdminRewardActivityRow): boolean {
  return (
    row.distribution_mode === "flash_only" &&
    row.display_status !== "ended" &&
    row.display_status !== "archived" &&
    row.display_status !== "draft"
  );
}

export function RewardActivityCard({
  row,
  disabled = false,
  onStatusChange,
}: RewardActivityCardProps) {
  const [open, setOpen] = useState(false);
  const shortId = formatActivityIdShort(row.activity_id);
  const rewardLabel = formatRewardActivityValue(row);
  const stockLabel = formatActivityStock(row);

  return (
    <article className="px-1 py-2.5 transition-colors hover:bg-bg-hover/30 sm:py-3">
      <div className="flex items-start gap-2">
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className="flex min-w-0 flex-1 items-start gap-2 rounded-lg px-1 py-0.5 text-left transition-colors hover:bg-brand/5 active:scale-[0.99]"
          aria-expanded={open}
        >
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="font-mono text-[10px] text-text-disabled">
                #{shortId}
              </span>
              {statusBadge(row.display_status)}
              <Badge
                variant="outline"
                className="border-brand/30 bg-brand/10 font-mono text-[10px] text-brand"
              >
                {TYPE_LABELS[row.type]}
              </Badge>
            </div>
            <h3 className="font-sans text-[14px] font-bold leading-snug text-text-primary">
              {row.title}
            </h3>
            {!open ? (
              <p className="truncate font-sans text-[11px] text-text-secondary">
                <span className="font-mono text-brand">{rewardLabel}</span>
                <span className="mx-1.5 text-text-disabled">·</span>
                庫存 {stockLabel}
                <span className="mx-1.5 text-text-disabled">·</span>
                已領 {row.claimed_count.toLocaleString("zh-TW")}
              </p>
            ) : null}
          </div>
          <ChevronDown
            className={`mt-0.5 size-4 shrink-0 text-text-disabled transition-transform ${
              open ? "rotate-180" : ""
            }`}
            aria-hidden="true"
          />
        </button>

        {showFlashSwitch(row) ? (
          <div
            className="flex shrink-0 items-center gap-1.5 pt-0.5"
            title="切換 進行中 / 已暫停"
          >
            <span className="font-mono text-[10px] text-text-secondary">
              {row.display_status === "active" ? "開啟" : "關閉"}
            </span>
            <Switch
              checked={row.display_status === "active"}
              disabled={disabled}
              onCheckedChange={(checked) => {
                onStatusChange(row, checked ? "active" : "paused");
              }}
              className={FORM_SWITCH_CLASS}
            />
          </div>
        ) : null}
      </div>

      {open ? (
        <div className="mt-2 space-y-2.5 border-t border-white/[0.06] pt-2.5 pl-1">
          <dl className="grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-2 font-sans text-[11px]">
            <div className="flex gap-1.5 min-w-0">
              <dt className="shrink-0 text-text-disabled">發放</dt>
              <dd className="min-w-0 truncate text-text-primary">
                {DISTRIBUTION_MODE_LABELS[row.distribution_mode]}
              </dd>
            </div>
            <div className="flex gap-1.5 min-w-0">
              <dt className="shrink-0 text-text-disabled">觸發</dt>
              <dd className="min-w-0 truncate text-text-primary">
                {formatTriggerConditionLabel(
                  row.trigger_conditions,
                  row.distribution_mode,
                )}
              </dd>
            </div>
            <div className="flex gap-1.5 min-w-0 sm:col-span-2">
              <dt className="shrink-0 text-text-disabled">有效期</dt>
              <dd className="min-w-0 font-mono text-[10px] text-text-primary">
                {formatActivityValidityPeriod(row)}
              </dd>
            </div>
            <div className="flex gap-1.5 min-w-0">
              <dt className="shrink-0 text-text-disabled">獎勵</dt>
              <dd className="min-w-0 truncate font-mono font-semibold text-brand">
                {rewardLabel}
              </dd>
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-0.5">
              <span className="text-text-disabled">
                庫存{" "}
                <span className="font-mono font-semibold text-brand">
                  {stockLabel}
                </span>
              </span>
              <span className="text-text-disabled">
                已領{" "}
                <span className="font-mono font-bold text-text-primary">
                  {row.claimed_count.toLocaleString("zh-TW")}
                </span>
              </span>
              {row.distribution_mode === "flash_only" ? (
                <span className="text-text-disabled">
                  上限{" "}
                  <span className="font-mono font-bold text-success">
                    {row.max_claims_per_user ?? 1}
                  </span>
                </span>
              ) : null}
            </div>
          </dl>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap gap-1.5">
              <Link
                href={`/admin/campaigns/${row.activity_id}`}
                className={BTN_OUTLINE_SM_CLASS}
              >
                編輯
              </Link>
              {row.display_status === "draft" ? (
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => onStatusChange(row, "active")}
                  className={BTN_PRIMARY_SM_CLASS}
                >
                  發布
                </button>
              ) : null}
              {row.status !== "archived" ? (
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => onStatusChange(row, "archived")}
                  className={BTN_OUTLINE_SM_CLASS}
                >
                  封存
                </button>
              ) : null}
            </div>

            {row.created_at ? (
              <span className="font-mono text-[10px] text-text-disabled">
                {new Date(row.created_at).toLocaleDateString("zh-HK")}
              </span>
            ) : null}
          </div>
        </div>
      ) : null}
    </article>
  );
}
