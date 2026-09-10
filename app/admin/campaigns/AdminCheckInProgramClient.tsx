"use client";

import { useMemo, useState, useTransition } from "react";
import { ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { upsertAdminCheckInProgram } from "@/app/actions/admin-check-in-program";
import {
  BTN_PRIMARY_CLASS,
  FORM_INPUT_CLASS,
  FORM_INPUT_MONO_CLASS,
  FORM_LABEL_CLASS,
  FORM_SECTION_CLASS,
  FORM_SELECT_TRIGGER_CLASS,
  FORM_SWITCH_CLASS,
  FORM_TOGGLE_ROW_CLASS,
  SELECT_CONTENT_CLASS,
  SELECT_ITEM_CLASS,
  TABLE_FOOTER_CLASS,
} from "@/app/admin/campaigns/campaigns-ui";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { TYPE_LABELS } from "@/lib/admin-rewards/template-form";
import {
  buildDefaultCheckInProgramForm,
  completionRewardValueForType,
  programRowToForm,
} from "@/lib/admin-check-in-program/parse-check-in-program";
import type {
  CheckInCompletionType,
  CheckInProgramRow,
  CheckInProgramUpsertInput,
} from "@/lib/admin-check-in-program/types";

type AdminCheckInProgramClientProps = {
  initialRow: CheckInProgramRow | null;
  loadError: string | null;
  onActiveChange?: (active: boolean) => void;
};

const COMPLETION_TYPE_OPTIONS: CheckInCompletionType[] = [
  "points",
  "discount_coupon",
  "free_shipping",
];

function completionRewardSummary(form: CheckInProgramUpsertInput): string {
  if (!form.completion_enabled) {
    return "未啟用";
  }

  const typeLabel = TYPE_LABELS[form.completion_type];
  if (form.completion_type === "points") {
    const points = Number(form.completion_reward_value.points ?? 0);
    return `${typeLabel} · ${points} 分`;
  }

  if (form.completion_title.trim()) {
    return `${typeLabel} · ${form.completion_title.trim()}`;
  }

  return typeLabel;
}

export function AdminCheckInProgramClient({
  initialRow,
  loadError,
  onActiveChange,
}: AdminCheckInProgramClientProps) {
  const [form, setForm] = useState<CheckInProgramUpsertInput>(
    initialRow ? programRowToForm(initialRow) : buildDefaultCheckInProgramForm(),
  );
  const [typeLocked, setTypeLocked] = useState(
    initialRow?.completion_type_locked ?? false,
  );
  const [completionOpen, setCompletionOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const dailyTotal = useMemo(
    () =>
      Array.from({ length: 7 }, (_, index) => {
        const day = index + 1;
        const value = Number(form.daily_rewards[String(day)] ?? 0);
        return Number.isFinite(value) ? value : 0;
      }).reduce((sum, value) => sum + value, 0),
    [form.daily_rewards],
  );

  const updateDailyReward = (day: number, value: string) => {
    const points = Number(value);
    setForm((prev) => ({
      ...prev,
      daily_rewards: {
        ...prev.daily_rewards,
        [String(day)]: Number.isFinite(points) ? points : 0,
      },
    }));
  };

  const handleCompletionTypeChange = (type: CheckInCompletionType) => {
    setForm((prev) => ({
      ...prev,
      completion_type: type,
      completion_reward_value: completionRewardValueForType(type),
    }));
  };

  const handleActiveChange = (active: boolean) => {
    setForm((prev) => ({ ...prev, is_active: active }));
    onActiveChange?.(active);
  };

  const handleSave = () => {
    startTransition(async () => {
      const result = await upsertAdminCheckInProgram(form);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      setForm(programRowToForm(result.data));
      setTypeLocked(result.data.completion_type_locked);
      onActiveChange?.(result.data.is_active);
      toast.success("簽到計劃已儲存");
    });
  };

  if (loadError) {
    return (
      <div className="rounded-lg border border-error/30 bg-error/10 px-4 py-3 font-sans text-[13px] text-error">
        {loadError}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl pb-20">
      <div className="space-y-4">
        <section className="space-y-3 border-b border-white/[0.08] pb-4">
          <h3 className={FORM_SECTION_CLASS}>基本設定</h3>
          <div className={FORM_TOGGLE_ROW_CLASS}>
            <div className="min-w-0 space-y-0.5">
              <Label htmlFor="program-active" className={FORM_LABEL_CLASS}>
                啟用簽到
              </Label>
              <p className="font-sans text-[11px] text-text-disabled">
                7 日一輪 · MVP 固定
              </p>
            </div>
            <Switch
              id="program-active"
              checked={form.is_active}
              onCheckedChange={handleActiveChange}
              className={FORM_SWITCH_CLASS}
            />
          </div>
        </section>

        <section className="space-y-3 border-b border-white/[0.08] pb-4">
          <div className="flex items-center justify-between gap-2">
            <h3 className={FORM_SECTION_CLASS}>每日獎勵（積分）</h3>
            <span className="font-mono text-[11px] text-brand">
              7 日合計 {dailyTotal.toLocaleString("en-US")} 分
            </span>
          </div>
          <div className="overflow-x-auto rounded-lg border border-white/[0.08]">
            <Table>
              <TableHeader className="border-b border-white/[0.08]">
                <TableRow className="border-transparent hover:bg-transparent">
                  {Array.from({ length: 7 }, (_, i) => i + 1).map((day) => (
                    <TableHead
                      key={day}
                      className="h-8 px-1 text-center font-mono text-[10px] font-medium text-text-disabled"
                    >
                      第{day}日
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow className="border-transparent hover:bg-transparent">
                  {Array.from({ length: 7 }, (_, i) => i + 1).map((day) => (
                    <TableCell key={day} className="p-1.5 align-top">
                      <Input
                        id={`day-${day}`}
                        type="number"
                        min={1}
                        aria-label={`第 ${day} 日積分`}
                        value={form.daily_rewards[String(day)] ?? ""}
                        onChange={(e) => updateDailyReward(day, e.target.value)}
                        className={`${FORM_INPUT_MONO_CLASS} h-8 min-w-[2.75rem] px-1 text-center text-[12px]`}
                      />
                    </TableCell>
                  ))}
                </TableRow>
              </TableBody>
              <TableFooter className={TABLE_FOOTER_CLASS}>
                <TableRow className="border-transparent hover:bg-transparent">
                  <TableCell
                    colSpan={7}
                    className="py-2 text-center font-mono text-[10px] text-brand"
                  >
                    合計 {dailyTotal.toLocaleString("en-US")} 積分
                  </TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          </div>
        </section>

        <section className="space-y-3 border-b border-white/[0.08] pb-4">
          <div className="flex items-start justify-between gap-2">
            <h3 className={FORM_SECTION_CLASS}>簽滿 7 日額外獎勵</h3>
            {form.completion_enabled ? (
              <button
                type="button"
                onClick={() => setCompletionOpen((open) => !open)}
                className="inline-flex items-center gap-1 font-sans text-[11px] text-brand hover:text-text-primary"
              >
                {completionOpen ? "收合" : "展開設定"}
                <ChevronDown
                  className={`size-3.5 transition-transform ${
                    completionOpen ? "rotate-180" : ""
                  }`}
                  aria-hidden="true"
                />
              </button>
            ) : null}
          </div>

          <div className={FORM_TOGGLE_ROW_CLASS}>
            <Label htmlFor="completion-enabled" className={FORM_LABEL_CLASS}>
              啟用簽滿獎勵
            </Label>
            <Switch
              id="completion-enabled"
              checked={form.completion_enabled}
              onCheckedChange={(checked) => {
                setForm((prev) => ({
                  ...prev,
                  completion_enabled: checked,
                }));
                if (!checked) {
                  setCompletionOpen(false);
                }
              }}
              className={FORM_SWITCH_CLASS}
            />
          </div>

          {form.completion_enabled && !completionOpen ? (
            <p className="font-sans text-[12px] text-text-secondary">
              目前設定：
              <span className="ml-1 font-medium text-brand">
                {completionRewardSummary(form)}
              </span>
            </p>
          ) : null}

          {form.completion_enabled && completionOpen ? (
            <div className="space-y-3 rounded-lg border border-white/[0.08] bg-bg-page/40 p-3">
              <div className="space-y-1.5">
                <Label className={FORM_LABEL_CLASS}>獎勵類型</Label>
                <Select
                  value={form.completion_type}
                  items={TYPE_LABELS}
                  onValueChange={(value) =>
                    handleCompletionTypeChange(value as CheckInCompletionType)
                  }
                  disabled={typeLocked}
                >
                  <SelectTrigger className={FORM_SELECT_TRIGGER_CLASS}>
                    <SelectValue placeholder="選擇獎勵類型" />
                  </SelectTrigger>
                  <SelectContent className={SELECT_CONTENT_CLASS}>
                    {COMPLETION_TYPE_OPTIONS.map((type) => (
                      <SelectItem
                        key={type}
                        value={type}
                        className={SELECT_ITEM_CLASS}
                      >
                        {TYPE_LABELS[type]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {typeLocked ? (
                  <p className="font-mono text-[10px] text-text-disabled">
                    獎勵類型已鎖定（曾啟用過簽滿獎勵後不可更改類型）。
                  </p>
                ) : null}
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="completion-title" className={FORM_LABEL_CLASS}>
                    標題
                  </Label>
                  <Input
                    id="completion-title"
                    value={form.completion_title}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        completion_title: e.target.value,
                      }))
                    }
                    className={FORM_INPUT_CLASS}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label
                    htmlFor="completion-description"
                    className={FORM_LABEL_CLASS}
                  >
                    描述
                  </Label>
                  <Input
                    id="completion-description"
                    value={form.completion_description ?? ""}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        completion_description: e.target.value,
                      }))
                    }
                    className={FORM_INPUT_CLASS}
                  />
                </div>
              </div>

              {form.completion_type === "points" ? (
                <div className="space-y-1.5">
                  <Label htmlFor="completion-points" className={FORM_LABEL_CLASS}>
                    積分
                  </Label>
                  <Input
                    id="completion-points"
                    type="number"
                    min={1}
                    value={Number(form.completion_reward_value.points ?? 0)}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        completion_reward_value: {
                          points: Number(e.target.value),
                        },
                      }))
                    }
                    className={FORM_INPUT_MONO_CLASS}
                  />
                </div>
              ) : null}

              {form.completion_type === "discount_coupon" ? (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="completion-amount" className={FORM_LABEL_CLASS}>
                      折扣金額 (HKD)
                    </Label>
                    <Input
                      id="completion-amount"
                      type="number"
                      min={1}
                      value={Number(form.completion_reward_value.amount_hkd ?? 0)}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          completion_reward_value: {
                            ...prev.completion_reward_value,
                            amount_hkd: Number(e.target.value),
                          },
                        }))
                      }
                      className={FORM_INPUT_MONO_CLASS}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label
                      htmlFor="completion-min-spend"
                      className={FORM_LABEL_CLASS}
                    >
                      最低消費 (HKD)
                    </Label>
                    <Input
                      id="completion-min-spend"
                      type="number"
                      min={0}
                      value={Number(form.completion_reward_value.min_spend_hkd ?? 0)}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          completion_reward_value: {
                            ...prev.completion_reward_value,
                            min_spend_hkd: Number(e.target.value),
                          },
                        }))
                      }
                      className={FORM_INPUT_MONO_CLASS}
                    />
                  </div>
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label
                      htmlFor="completion-code-prefix"
                      className={FORM_LABEL_CLASS}
                    >
                      券碼前綴（選填）
                    </Label>
                    <Input
                      id="completion-code-prefix"
                      value={String(form.completion_reward_value.code_prefix ?? "")}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          completion_reward_value: {
                            ...prev.completion_reward_value,
                            code_prefix: e.target.value,
                          },
                        }))
                      }
                      className={FORM_INPUT_CLASS}
                    />
                  </div>
                </div>
              ) : null}

              {form.completion_type === "free_shipping" ? (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label
                      htmlFor="completion-max-subsidy"
                      className={FORM_LABEL_CLASS}
                    >
                      免運補貼上限 (HKD)
                    </Label>
                    <Input
                      id="completion-max-subsidy"
                      type="number"
                      min={1}
                      value={Number(form.completion_reward_value.max_subsidy_hkd ?? 0)}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          completion_reward_value: {
                            ...prev.completion_reward_value,
                            max_subsidy_hkd: Number(e.target.value),
                          },
                        }))
                      }
                      className={FORM_INPUT_MONO_CLASS}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label
                      htmlFor="completion-fs-min-spend"
                      className={FORM_LABEL_CLASS}
                    >
                      最低消費 (HKD)
                    </Label>
                    <Input
                      id="completion-fs-min-spend"
                      type="number"
                      min={0}
                      value={Number(form.completion_reward_value.min_spend_hkd ?? 0)}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          completion_reward_value: {
                            ...prev.completion_reward_value,
                            min_spend_hkd: Number(e.target.value),
                          },
                        }))
                      }
                      className={FORM_INPUT_MONO_CLASS}
                    />
                  </div>
                </div>
              ) : null}

              {form.completion_type !== "points" ? (
                <div className="space-y-1.5">
                  <Label htmlFor="completion-valid-days" className={FORM_LABEL_CLASS}>
                    有效天數（選填）
                  </Label>
                  <Input
                    id="completion-valid-days"
                    type="number"
                    min={1}
                    value={form.completion_valid_duration_days ?? ""}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        completion_valid_duration_days: e.target.value
                          ? Number(e.target.value)
                          : null,
                      }))
                    }
                    className={FORM_INPUT_MONO_CLASS}
                  />
                </div>
              ) : null}
            </div>
          ) : null}

          <p className="font-mono text-[10px] text-text-disabled">
            修改獎勵面額只影響之後發放；已發放未使用券以結帳時模板設定為準。
          </p>
        </section>
      </div>

      <div
        className="sticky bottom-0 z-10 -mx-4 border-t border-white/[0.08] bg-[#17130f]/95 px-4 py-3 backdrop-blur-sm lg:-mx-6 lg:px-6"
      >
        <button
          type="button"
          onClick={handleSave}
          disabled={isPending}
          className={`${BTN_PRIMARY_CLASS} h-10 w-full disabled:opacity-50 disabled:pointer-events-none`}
        >
          {isPending ? "儲存中…" : "儲存簽到計劃"}
        </button>
      </div>
    </div>
  );
}
