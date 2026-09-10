"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  setAdminRewardActivityStatus,
  upsertAdminRewardActivity,
} from "@/app/actions/admin-reward-activities";
import {
  BTN_OUTLINE_CLASS,
  BTN_PRIMARY_CLASS,
  FILTER_CHIP_CLASS,
  FORM_INPUT_CLASS,
  FORM_LABEL_CLASS,
  FORM_SECTION_CLASS,
  FORM_SELECT_TRIGGER_CLASS,
  FORM_STICKY_FOOTER_CLASS,
  SELECT_CONTENT_CLASS,
  SELECT_ITEM_CLASS,
} from "@/app/admin/campaigns/campaigns-ui";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  applyFormFlow,
  buildDefaultActivityForm,
  buildDefaultFlashSchedule,
  deriveFormFlow,
  DISTRIBUTION_MODE_LABELS,
  EVENT_ONCE_LABELS,
  FORM_FLOW_DESCRIPTIONS,
  FORM_FLOW_LABELS,
  isCatalogEligibleRewardType,
  orderKindsToScope,
  ORDER_KINDS_SCOPE_LABELS,
  restrictionsForTypeChange,
  rewardValueForType,
  scopeToOrderKinds,
  shouldShowAutoGrantTriggers,
  TRIGGER_KIND_LABELS,
  TRADE_ROLE_LABELS,
  TYPE_LABELS,
  type AdminRewardFormFlow,
  type OrderKindsScope,
} from "@/lib/admin-rewards/template-form";
import type {
  AdminRewardActivityUpsertInput,
  AdminRewardDistributionMode,
  AdminRewardEventOnceEvent,
  AdminRewardTemplateType,
  AdminRewardTriggerKind,
} from "@/lib/admin-rewards/types";
import { DEFAULT_ADMIN_REWARD_RESTRICTIONS } from "@/lib/admin-rewards/types";
import { cn } from "@/lib/utils";

const FORM_SECTION_CLASSNAME =
  "space-y-3 border-b border-white/[0.08] pb-4";

const AUTH_REQUIREMENT_LABELS: Record<"any" | "true" | "false", string> = {
  any: "全部訂單",
  true: "僅鑑定單",
  false: "僅非鑑定單",
};

const TRIGGER_KIND_SELECT_ITEMS: Record<
  "event_once" | "trade_count",
  string
> = {
  event_once: TRIGGER_KIND_LABELS.event_once,
  trade_count: TRIGGER_KIND_LABELS.trade_count,
};

const TRADE_ROLE_SELECT_ITEMS: Record<"buyer" | "merchant", string> = {
  buyer: TRADE_ROLE_LABELS.buyer,
  merchant: TRADE_ROLE_LABELS.merchant,
};

type RewardActivityFormProps = {
  initialForm?: AdminRewardActivityUpsertInput;
  initialFlow?: AdminRewardFormFlow;
};

function localDateTimeToIso(value: string): string {
  if (!value.trim()) {
    return "";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return date.toISOString();
}

function validateFlashSchedule(form: AdminRewardActivityUpsertInput): string | null {
  const schedule = form.schedule ?? form.flash_schedule;
  if (!schedule) {
    return "請設定搶券檔期";
  }
  if (!schedule.starts_at || !schedule.ends_at) {
    return "請設定活動開始與結束時間";
  }
  const startsAt = localDateTimeToIso(schedule.starts_at);
  const endsAt = localDateTimeToIso(schedule.ends_at);
  if (!startsAt || !endsAt) {
    return "活動時間格式無效";
  }
  if (new Date(endsAt).getTime() <= new Date(startsAt).getTime()) {
    return "活動結束時間必須晚於開始時間";
  }
  if (schedule.max_claims <= 0) {
    return "場次庫存必須大於 0";
  }
  if (schedule.max_claims_per_user <= 0) {
    return "每人限搶必須大於 0";
  }
  return null;
}

function validateAutoGrantSchedule(
  form: AdminRewardActivityUpsertInput,
): string | null {
  const schedule = form.schedule ?? form.flash_schedule;
  const hasStart = Boolean(schedule?.starts_at?.trim());
  const hasEnd = Boolean(schedule?.ends_at?.trim());
  if (!hasStart && !hasEnd) {
    return null;
  }
  if (!hasStart || !hasEnd) {
    return "請同時設定活動開始與結束時間，或留空表示不限期";
  }
  const startsAt = localDateTimeToIso(schedule!.starts_at);
  const endsAt = localDateTimeToIso(schedule!.ends_at);
  if (!startsAt || !endsAt) {
    return "活動時間格式無效";
  }
  if (new Date(endsAt).getTime() <= new Date(startsAt).getTime()) {
    return "活動結束時間必須晚於開始時間";
  }
  return null;
}

function validateRedemptionCatalog(
  form: AdminRewardActivityUpsertInput,
): string | null {
  const catalog = form.redemption_catalog;
  if (!catalog?.enabled) {
    return null;
  }

  if (form.distribution_mode === "flash_only") {
    return "搶券活動不可同時上架積分商城";
  }

  if (form.type !== "discount_coupon" && form.type !== "free_shipping") {
    return "僅折扣券與免運券可上架積分商城";
  }

  if (catalog.points_cost <= 0) {
    return "兌換積分必須大於 0";
  }

  if (catalog.stock < 0) {
    return "商城庫存不可為負數";
  }

  const maxPerUser = catalog.max_redemptions_per_user;
  if (maxPerUser != null && maxPerUser <= 0) {
    return "每人限兌必須大於 0，或留空表示不限";
  }

  return null;
}

export function RewardActivityForm({
  initialForm,
  initialFlow,
}: RewardActivityFormProps) {
  const router = useRouter();
  const resolvedInitialForm = initialForm ?? buildDefaultActivityForm();
  const [formFlow, setFormFlow] = useState<AdminRewardFormFlow>(
    initialFlow ?? deriveFormFlow(resolvedInitialForm),
  );
  const [form, setForm] = useState<AdminRewardActivityUpsertInput>(
    initialFlow ? applyFormFlow(resolvedInitialForm, initialFlow) : resolvedInitialForm,
  );
  const [isPending, startTransition] = useTransition();

  const isEditing = Boolean(form.id);
  const isPointsMallFlow = formFlow === "points_mall";
  const mode = form.distribution_mode ?? "auto_grant";
  const redemptionCatalog = form.redemption_catalog ?? {
    enabled: false,
    points_cost: 500,
    stock: 100,
    is_active: false,
    max_redemptions_per_user: null,
  };
  const showTriggerConditions = shouldShowAutoGrantTriggers(
    mode,
    redemptionCatalog,
    formFlow,
  );
  const showCouponValidityLimits =
    mode === "auto_grant" || isPointsMallFlow;
  const triggerKind = (form.trigger_conditions.kind ??
    "event_once") as AdminRewardTriggerKind;
  const isLegacyCheckInTrigger =
    triggerKind === "check_in_streak" || triggerKind === "check_in_cycle_day";
  const schedule = form.schedule ?? form.flash_schedule;

  const ensureFlashSchedule = (
    next: AdminRewardActivityUpsertInput,
  ): AdminRewardActivityUpsertInput => {
    if (next.distribution_mode === "flash_only" && !next.schedule && !next.flash_schedule) {
      const defaults = buildDefaultFlashSchedule();
      return {
        ...next,
        trigger_conditions: { kind: "none" },
        schedule: {
          ...defaults,
          name: next.title || defaults.campaign_name,
          campaign_name: next.title || defaults.campaign_name,
        },
        flash_schedule: {
          ...defaults,
          campaign_name: next.title || defaults.campaign_name,
        },
      };
    }
    return next;
  };

  const normalizeForFlow = (
    next: AdminRewardActivityUpsertInput,
    flow: AdminRewardFormFlow = formFlow,
  ): AdminRewardActivityUpsertInput => {
    if (flow === "points_mall") {
      const nextType = isCatalogEligibleRewardType(next.type)
        ? next.type
        : "discount_coupon";
      return {
        ...next,
        type: nextType,
        distribution_mode: "auto_grant",
        trigger_conditions: { kind: "none" },
        flash_schedule: undefined,
        redemption_catalog: isCatalogEligibleRewardType(nextType)
          ? {
              ...(next.redemption_catalog ?? redemptionCatalog),
              enabled: true,
              is_active: true,
            }
          : undefined,
      };
    }

    return {
      ...next,
      redemption_catalog: undefined,
    };
  };

  const handleChange = (next: AdminRewardActivityUpsertInput) => {
    setForm(ensureFlashSchedule(normalizeForFlow(next)));
  };

  const handleFlowChange = (nextFlow: AdminRewardFormFlow) => {
    if (nextFlow === formFlow) {
      return;
    }
    setFormFlow(nextFlow);
    setForm((current) => ensureFlashSchedule(applyFormFlow(current, nextFlow)));
  };

  const handleDistributionChange = (value: AdminRewardDistributionMode) => {
    if (value === "flash_only") {
      handleChange({
        ...form,
        distribution_mode: value,
        trigger_conditions: { kind: "none" },
        schedule: schedule ?? {
          ...buildDefaultFlashSchedule(),
          name: form.title,
          campaign_name: form.title,
        },
      });
      return;
    }

    handleChange({
      ...form,
      distribution_mode: value,
      trigger_conditions:
        form.trigger_conditions.kind === "none"
          ? {
              kind: "event_once",
              event: "profile_complete",
              once_per_user: true,
            }
          : form.trigger_conditions,
      schedule: undefined,
      flash_schedule: undefined,
    });
  };

  const updateTrigger = (patch: Record<string, unknown>) => {
    handleChange({
      ...form,
      trigger_conditions: { ...form.trigger_conditions, ...patch },
    });
  };

  const updateSchedule = (patch: Record<string, unknown>) => {
    const current = schedule ?? buildDefaultFlashSchedule();
    const nextSchedule = { ...current, ...patch };
    handleChange({
      ...form,
      schedule: nextSchedule,
      flash_schedule: {
        campaign_id: nextSchedule.campaign_id,
        campaign_name:
          (nextSchedule.campaign_name as string | undefined) ??
          form.title,
        starts_at: nextSchedule.starts_at,
        ends_at: nextSchedule.ends_at,
        max_claims: nextSchedule.max_claims,
        max_claims_per_user: nextSchedule.max_claims_per_user,
        override_valid_days: nextSchedule.override_valid_days,
      },
    });
  };

  const saveDraft = () => {
    if (isLegacyCheckInTrigger) {
      return;
    }

    if (mode === "auto_grant") {
      const scheduleError = validateAutoGrantSchedule(form);
      if (scheduleError) {
        toast.error(scheduleError);
        return;
      }
    }

    const catalogError = validateRedemptionCatalog(form);
    if (catalogError) {
      toast.error(catalogError);
      return;
    }

    startTransition(async () => {
      const result = await upsertAdminRewardActivity(form);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(form.id ? "已更新草稿" : "已建立草稿");
      if (!form.id) {
        router.replace(`/admin/campaigns/${result.data.activityId}`);
      }
      setForm((current) => ({ ...current, id: result.data.activityId }));
    });
  };

  const publish = () => {
    if (isLegacyCheckInTrigger) {
      return;
    }

    if (mode === "flash_only") {
      const scheduleError = validateFlashSchedule(form);
      if (scheduleError) {
        toast.error(scheduleError);
        return;
      }
    }
    if (mode === "auto_grant") {
      const scheduleError = validateAutoGrantSchedule(form);
      if (scheduleError) {
        toast.error(scheduleError);
        return;
      }
    }

    const catalogError = validateRedemptionCatalog(form);
    if (catalogError) {
      toast.error(catalogError);
      return;
    }

    startTransition(async () => {
      const saveResult = await upsertAdminRewardActivity(form);
      if (!saveResult.success) {
        toast.error(saveResult.error);
        return;
      }

      const activityId = saveResult.data.activityId;
      const publishResult = await setAdminRewardActivityStatus(
        activityId,
        "active",
      );
      if (!publishResult.success) {
        toast.error(publishResult.error);
        return;
      }

      toast.success("已發布獎勵活動");
      router.push("/admin/campaigns");
      router.refresh();
    });
  };

  const eventOnceEvent = String(
    form.trigger_conditions.event ?? "profile_complete",
  );

  const orderKindsScope = orderKindsToScope(
    form.restrictions?.order_kinds ??
      DEFAULT_ADMIN_REWARD_RESTRICTIONS.order_kinds,
  );
  const authRequirement =
    form.restrictions?.requires_authentication ?? "any";
  const rewardTypeItems = isPointsMallFlow
    ? {
        discount_coupon: TYPE_LABELS.discount_coupon,
        free_shipping: TYPE_LABELS.free_shipping,
      }
    : TYPE_LABELS;

  return (
    <div className="pb-20">
      {isLegacyCheckInTrigger ? (
        <div className="mb-4 rounded-lg border border-brand/20 bg-brand/5 px-3 py-2.5 font-sans text-[12px] text-text-secondary">
          此簽到獎勵已遷移至「簽到計劃」分頁；此活動已封存，無法編輯。
        </div>
      ) : null}

      <div className="space-y-4">
        {/* 0. 建立類型 */}
        <section className={FORM_SECTION_CLASSNAME}>
          <h2 className={FORM_SECTION_CLASS}>建立類型</h2>
          <p className="font-sans text-[11px] leading-relaxed text-text-secondary">
            {FORM_FLOW_DESCRIPTIONS[formFlow]}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {(["general", "points_mall"] as const).map((flow) => (
              <button
                key={flow}
                type="button"
                disabled={isEditing || isLegacyCheckInTrigger}
                onClick={() => handleFlowChange(flow)}
                className={cn(
                  FILTER_CHIP_CLASS(formFlow === flow),
                  isEditing || isLegacyCheckInTrigger
                    ? "cursor-not-allowed opacity-60"
                    : "",
                )}
              >
                {FORM_FLOW_LABELS[flow]}
              </button>
            ))}
          </div>
          {isEditing ? (
            <p className="font-mono text-[10px] text-text-disabled">
              編輯既有活動時無法變更建立類型。
            </p>
          ) : null}
        </section>

        {/* 1. 基本資料 */}
        <section className={FORM_SECTION_CLASSNAME}>
          <h2 className={FORM_SECTION_CLASS}>基本資料</h2>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="activity-title" className={FORM_LABEL_CLASS}>
                活動名稱 <span className="text-brand">*</span>
              </Label>
              <Input
                id="activity-title"
                value={form.title}
                onChange={(event) =>
                  handleChange({ ...form, title: event.target.value })
                }
                className={FORM_INPUT_CLASS}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="activity-description" className={FORM_LABEL_CLASS}>
                描述
              </Label>
              <Input
                id="activity-description"
                value={form.description ?? ""}
                onChange={(event) =>
                  handleChange({ ...form, description: event.target.value })
                }
                className={FORM_INPUT_CLASS}
              />
            </div>
          </div>
        </section>

        {/* 2. 使用限制與有效期 */}
        <section className={FORM_SECTION_CLASSNAME}>
            <h2 className={FORM_SECTION_CLASS}>使用限制與有效期</h2>
            <div className="grid gap-3 md:grid-cols-2">
              {isCatalogEligibleRewardType(form.type) ? (
                <div className="space-y-2">
                  <Label htmlFor="reward-order-kinds" className={FORM_LABEL_CLASS}>
                    適用訂單
                  </Label>
                  <Select
                    value={orderKindsScope}
                    items={ORDER_KINDS_SCOPE_LABELS}
                    onValueChange={(value) =>
                      handleChange({
                        ...form,
                        restrictions: {
                          ...(form.restrictions ?? DEFAULT_ADMIN_REWARD_RESTRICTIONS),
                          order_kinds: scopeToOrderKinds(value as OrderKindsScope),
                        },
                      })
                    }
                  >
                    <SelectTrigger id="reward-order-kinds" className={FORM_SELECT_TRIGGER_CLASS}>
                      <SelectValue placeholder="選擇適用訂單" />
                    </SelectTrigger>
                    <SelectContent className={SELECT_CONTENT_CLASS}>
                      {(Object.keys(ORDER_KINDS_SCOPE_LABELS) as OrderKindsScope[]).map(
                        (scope) => (
                          <SelectItem
                            key={scope}
                            value={scope}
                            className={SELECT_ITEM_CLASS}
                          >
                            {ORDER_KINDS_SCOPE_LABELS[scope]}
                          </SelectItem>
                        ),
                      )}
                    </SelectContent>
                  </Select>
                  {form.type === "discount_coupon" ? (
                    <p className="font-sans text-[11px] text-text-secondary">
                      C2C 鑑定結帳僅支援免運券；折扣券請選商戶或兩者皆可（會員端仍會灰顯）。
                    </p>
                  ) : null}
                </div>
              ) : null}
              <div className="space-y-2">
                <Label className={FORM_LABEL_CLASS}>適用鑑定</Label>
                <Select
                  value={authRequirement}
                  items={AUTH_REQUIREMENT_LABELS}
                  onValueChange={(value) =>
                    handleChange({
                      ...form,
                      restrictions: {
                        ...(form.restrictions ?? DEFAULT_ADMIN_REWARD_RESTRICTIONS),
                        requires_authentication: value as "any" | "true" | "false",
                      },
                    })
                  }
                >
                  <SelectTrigger className={FORM_SELECT_TRIGGER_CLASS}>
                    <SelectValue placeholder="選擇適用鑑定" />
                  </SelectTrigger>
                  <SelectContent className={SELECT_CONTENT_CLASS}>
                    <SelectItem value="any" className={SELECT_ITEM_CLASS}>
                      全部訂單
                    </SelectItem>
                    <SelectItem value="true" className={SELECT_ITEM_CLASS}>
                      僅鑑定單
                    </SelectItem>
                    <SelectItem value="false" className={SELECT_ITEM_CLASS}>
                      僅非鑑定單
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {showCouponValidityLimits ? (
                <div className="space-y-2">
                  <Label htmlFor="valid-days" className={FORM_LABEL_CLASS}>
                    領取後有效天數
                  </Label>
                  <Input
                    id="valid-days"
                    type="number"
                    value={String(form.valid_duration_days ?? "")}
                    onChange={(event) =>
                      handleChange({
                        ...form,
                        valid_duration_days: event.target.value
                          ? Number(event.target.value)
                          : null,
                      })
                    }
                    className={FORM_INPUT_CLASS}
                  />
                </div>
              ) : null}
              {showCouponValidityLimits ? (
                <div className="space-y-2">
                  <Label htmlFor="max-claims" className={FORM_LABEL_CLASS}>
                    限量（空白=無限）
                  </Label>
                  <Input
                    id="max-claims"
                    type="number"
                    value={form.is_infinite ? "" : String(form.max_claims ?? "")}
                    onChange={(event) => {
                      const raw = event.target.value.trim();
                      if (!raw) {
                        handleChange({
                          ...form,
                          is_infinite: true,
                          max_claims: null,
                        });
                        return;
                      }
                      handleChange({
                        ...form,
                        is_infinite: false,
                        max_claims: Number(raw),
                      });
                    }}
                    className={FORM_INPUT_CLASS}
                  />
                </div>
              ) : null}
            </div>
        </section>

        {/* 3. 發放方式（一般券） */}
        {!isPointsMallFlow ? (
        <section className={FORM_SECTION_CLASSNAME}>
            <h2 className={FORM_SECTION_CLASS}>發放方式</h2>
            <Select
              value={mode}
              items={DISTRIBUTION_MODE_LABELS}
              onValueChange={(value) => {
                if (value) {
                  handleDistributionChange(value);
                }
              }}
            >
              <SelectTrigger className={cn(FORM_SELECT_TRIGGER_CLASS, "max-w-md")}>
                <SelectValue placeholder="選擇發放方式" />
              </SelectTrigger>
              <SelectContent className={SELECT_CONTENT_CLASS}>
                <SelectItem value="auto_grant" className={SELECT_ITEM_CLASS}>
                  {DISTRIBUTION_MODE_LABELS.auto_grant}
                </SelectItem>
                <SelectItem value="flash_only" className={SELECT_ITEM_CLASS}>
                  {DISTRIBUTION_MODE_LABELS.flash_only}
                </SelectItem>
              </SelectContent>
            </Select>
            {mode === "flash_only" ? (
              <p className="font-sans text-[11px] text-brand">
                用戶於活動期內主動搶領，先到先得，無需觸發條件。
              </p>
            ) : (
              <p className="font-sans text-[11px] text-text-secondary">
                用戶滿足觸發條件後，系統自動發放入錢包。
              </p>
            )}
        </section>
        ) : null}

        {/* 4. 觸發條件（一般券） */}
        {showTriggerConditions ? (
          <section className={FORM_SECTION_CLASSNAME}>
              <h2 className={FORM_SECTION_CLASS}>觸發條件</h2>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-2">
                  <Label className={FORM_LABEL_CLASS}>條件類型</Label>
                  <Select
                    value={triggerKind}
                    items={TRIGGER_KIND_SELECT_ITEMS}
                    onValueChange={(value) => {
                      const kind = value as AdminRewardTriggerKind;
                      if (kind === "event_once") {
                        updateTrigger({
                          kind,
                          event: "profile_complete",
                          once_per_user: true,
                        });
                      } else {
                        updateTrigger({
                          kind: "trade_count",
                          role: "buyer",
                          count: 1,
                          once_per_user: true,
                        });
                      }
                    }}
                  >
                    <SelectTrigger className={FORM_SELECT_TRIGGER_CLASS}>
                      <SelectValue placeholder="選擇條件類型" />
                    </SelectTrigger>
                    <SelectContent className={SELECT_CONTENT_CLASS}>
                      <SelectItem value="event_once" className={SELECT_ITEM_CLASS}>
                        一次性事件
                      </SelectItem>
                      <SelectItem value="trade_count" className={SELECT_ITEM_CLASS}>
                        成交筆數
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {triggerKind === "event_once" ? (
                  <div className="space-y-2">
                    <Label className={FORM_LABEL_CLASS}>事件</Label>
                    <Select
                      value={String(form.trigger_conditions.event ?? "profile_complete")}
                      items={EVENT_ONCE_LABELS}
                      onValueChange={(value) =>
                        updateTrigger({
                          event: value as AdminRewardEventOnceEvent,
                          once_per_user: true,
                        })
                      }
                    >
                      <SelectTrigger className={FORM_SELECT_TRIGGER_CLASS}>
                        <SelectValue placeholder="選擇事件" />
                      </SelectTrigger>
                      <SelectContent className={SELECT_CONTENT_CLASS}>
                        <SelectItem value="profile_complete" className={SELECT_ITEM_CLASS}>
                          完善個人資料
                        </SelectItem>
                        <SelectItem value="first_listing" className={SELECT_ITEM_CLASS}>
                          首次上架
                        </SelectItem>
                        <SelectItem value="first_chat" className={SELECT_ITEM_CLASS}>
                          首次聊天
                        </SelectItem>
                        <SelectItem value="account_registered" className={SELECT_ITEM_CLASS}>
                          註冊完成
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    {eventOnceEvent === "account_registered" ? (
                      <p className="font-sans text-[12px] text-text-secondary">
                        {schedule?.starts_at && schedule?.ends_at
                          ? "僅活動開始後完成註冊的用戶可領（以帳戶建立時間為準，非首次登入）"
                          : "未設定活動期限時以模板建立時間為準；建議註冊券設定開始時間。非首次登入。"}
                      </p>
                    ) : null}
                  </div>
                ) : null}

                {triggerKind === "trade_count" ? (
                  <div className="grid gap-3 sm:grid-cols-2 md:col-span-2">
                    <div className="space-y-2">
                      <Label className={FORM_LABEL_CLASS}>角色</Label>
                      <Select
                        value={String(form.trigger_conditions.role ?? "buyer")}
                        items={TRADE_ROLE_SELECT_ITEMS}
                        onValueChange={(value) =>
                          updateTrigger({ role: value, once_per_user: true })
                        }
                      >
                        <SelectTrigger className={FORM_SELECT_TRIGGER_CLASS}>
                          <SelectValue placeholder="選擇角色" />
                        </SelectTrigger>
                        <SelectContent className={SELECT_CONTENT_CLASS}>
                          <SelectItem value="buyer" className={SELECT_ITEM_CLASS}>
                            買家
                          </SelectItem>
                          <SelectItem value="merchant" className={SELECT_ITEM_CLASS}>
                            商戶
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="trade-count" className={FORM_LABEL_CLASS}>
                        筆數
                      </Label>
                      <Input
                        id="trade-count"
                        type="number"
                        value={String(form.trigger_conditions.count ?? 1)}
                        onChange={(event) =>
                          updateTrigger({
                            count: Number(event.target.value),
                            once_per_user: true,
                          })
                        }
                        className={FORM_INPUT_CLASS}
                      />
                    </div>
                  </div>
                ) : null}
              </div>
          </section>
        ) : null}

        {/* 5. 獎勵內容 */}
        <section className={FORM_SECTION_CLASSNAME}>
            <h2 className={FORM_SECTION_CLASS}>獎勵內容</h2>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-2">
                <Label className={FORM_LABEL_CLASS}>
                  類型 <span className="text-brand">*</span>
                </Label>
                <Select
                  value={form.type}
                  items={rewardTypeItems}
                  onValueChange={(value) => {
                    const nextType = value as AdminRewardTemplateType;
                    handleChange({
                      ...form,
                      type: nextType,
                      reward_value: rewardValueForType(nextType),
                      restrictions: restrictionsForTypeChange(
                        nextType,
                        form.restrictions ?? DEFAULT_ADMIN_REWARD_RESTRICTIONS,
                      ),
                      redemption_catalog: isCatalogEligibleRewardType(nextType)
                        ? form.redemption_catalog
                        : undefined,
                    });
                  }}
                >
                  <SelectTrigger className={FORM_SELECT_TRIGGER_CLASS}>
                    <SelectValue placeholder="選擇類型" />
                  </SelectTrigger>
                  <SelectContent className={SELECT_CONTENT_CLASS}>
                    {!isPointsMallFlow ? (
                      <SelectItem value="points" className={SELECT_ITEM_CLASS}>
                        積分
                      </SelectItem>
                    ) : null}
                    <SelectItem value="discount_coupon" className={SELECT_ITEM_CLASS}>
                      折扣券
                    </SelectItem>
                    <SelectItem value="free_shipping" className={SELECT_ITEM_CLASS}>
                      免運券
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {form.type === "points" ? (
                <div className="space-y-2">
                  <Label htmlFor="reward-points" className={FORM_LABEL_CLASS}>
                    積分數
                  </Label>
                  <Input
                    id="reward-points"
                    type="number"
                    value={String(form.reward_value.points ?? 0)}
                    onChange={(event) =>
                      handleChange({
                        ...form,
                        reward_value: {
                          ...form.reward_value,
                          points: Number(event.target.value),
                        },
                      })
                    }
                    className={FORM_INPUT_CLASS}
                  />
                </div>
              ) : null}

              {form.type === "discount_coupon" ? (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="reward-amount" className={FORM_LABEL_CLASS}>
                      折扣金額 (HK$)
                    </Label>
                    <Input
                      id="reward-amount"
                      type="number"
                      value={String(form.reward_value.amount_hkd ?? 0)}
                      onChange={(event) =>
                        handleChange({
                          ...form,
                          reward_value: {
                            ...form.reward_value,
                            amount_hkd: Number(event.target.value),
                          },
                        })
                      }
                      className={FORM_INPUT_CLASS}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="reward-min-spend" className={FORM_LABEL_CLASS}>
                      最低消費 (HK$)
                    </Label>
                    <Input
                      id="reward-min-spend"
                      type="number"
                      value={String(form.reward_value.min_spend_hkd ?? 0)}
                      onChange={(event) =>
                        handleChange({
                          ...form,
                          reward_value: {
                            ...form.reward_value,
                            min_spend_hkd: Number(event.target.value),
                          },
                        })
                      }
                      className={FORM_INPUT_CLASS}
                    />
                  </div>
                </>
              ) : null}

              {form.type === "free_shipping" ? (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="reward-max-subsidy" className={FORM_LABEL_CLASS}>
                      平台補貼上限 (HK$)
                    </Label>
                    <Input
                      id="reward-max-subsidy"
                      type="number"
                      value={String(form.reward_value.max_subsidy_hkd ?? 0)}
                      onChange={(event) =>
                        handleChange({
                          ...form,
                          reward_value: {
                            ...form.reward_value,
                            max_subsidy_hkd: Number(event.target.value),
                          },
                        })
                      }
                      className={FORM_INPUT_CLASS}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="reward-shipping-min" className={FORM_LABEL_CLASS}>
                      最低消費 (HK$)
                    </Label>
                    <Input
                      id="reward-shipping-min"
                      type="number"
                      value={String(form.reward_value.min_spend_hkd ?? 0)}
                      onChange={(event) =>
                        handleChange({
                          ...form,
                          reward_value: {
                            ...form.reward_value,
                            min_spend_hkd: Number(event.target.value),
                          },
                        })
                      }
                      className={FORM_INPUT_CLASS}
                    />
                  </div>
                </>
              ) : null}
            </div>
        </section>

        {/* 6. 活動期限 */}
        {mode === "auto_grant" || isPointsMallFlow ? (
          <section className={FORM_SECTION_CLASSNAME}>
              <h2 className={FORM_SECTION_CLASS}>活動期限</h2>
              <p className="font-sans text-[11px] text-text-secondary">
                {isPointsMallFlow
                  ? "可選。不設定則發布後持續上架，直至封存或商城庫存用盡。"
                  : "可選。不設定則發布後持續有效，直至封存或模板庫存用盡。"}
              </p>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="auto-grant-starts" className={FORM_LABEL_CLASS}>
                    開始時間
                  </Label>
                  <Input
                    id="auto-grant-starts"
                    type="datetime-local"
                    value={schedule?.starts_at ?? ""}
                    onChange={(event) =>
                      updateSchedule({ starts_at: event.target.value })
                    }
                    className={FORM_INPUT_CLASS}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="auto-grant-ends" className={FORM_LABEL_CLASS}>
                    結束時間
                  </Label>
                  <Input
                    id="auto-grant-ends"
                    type="datetime-local"
                    value={schedule?.ends_at ?? ""}
                    onChange={(event) =>
                      updateSchedule({ ends_at: event.target.value })
                    }
                    className={FORM_INPUT_CLASS}
                  />
                </div>
              </div>
          </section>
        ) : null}

        {mode === "flash_only" && schedule && !isPointsMallFlow ? (
          <section className={FORM_SECTION_CLASSNAME}>
              <h2 className={FORM_SECTION_CLASS}>搶券檔期</h2>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="schedule-starts" className={FORM_LABEL_CLASS}>
                    開始時間
                  </Label>
                  <Input
                    id="campaign-starts"
                    type="datetime-local"
                    value={schedule.starts_at}
                    onChange={(event) =>
                      updateSchedule({ starts_at: event.target.value })
                    }
                    className={FORM_INPUT_CLASS}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="schedule-ends" className={FORM_LABEL_CLASS}>
                    結束時間
                  </Label>
                  <Input
                    id="campaign-ends"
                    type="datetime-local"
                    value={schedule.ends_at}
                    onChange={(event) =>
                      updateSchedule({ ends_at: event.target.value })
                    }
                    className={FORM_INPUT_CLASS}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="schedule-stock" className={FORM_LABEL_CLASS}>
                    場次庫存
                  </Label>
                  <Input
                    id="campaign-stock"
                    type="number"
                    min={1}
                    value={String(schedule.max_claims)}
                    onChange={(event) =>
                      updateSchedule({ max_claims: Number(event.target.value || 0) })
                    }
                    className={FORM_INPUT_CLASS}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="schedule-per-user" className={FORM_LABEL_CLASS}>
                    每人限搶
                  </Label>
                  <Input
                    id="campaign-per-user"
                    type="number"
                    min={1}
                    value={String(schedule.max_claims_per_user)}
                    onChange={(event) =>
                      updateSchedule({
                        max_claims_per_user: Number(event.target.value || 1),
                      })
                    }
                    className={FORM_INPUT_CLASS}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="schedule-valid-days" className={FORM_LABEL_CLASS}>
                    領取後有效天數（可選）
                  </Label>
                  <Input
                    id="schedule-valid-days"
                    type="number"
                    value={
                      schedule.override_valid_days == null
                        ? ""
                        : String(schedule.override_valid_days)
                    }
                    onChange={(event) => {
                      const raw = event.target.value.trim();
                      updateSchedule({
                        override_valid_days: raw ? Number(raw) : null,
                      });
                    }}
                    className={FORM_INPUT_CLASS}
                  />
                  <p className="font-mono text-[10px] text-text-disabled">
                    留空則使用模板預設有效期。
                  </p>
                </div>
              </div>
          </section>
        ) : null}

        {isPointsMallFlow ? (
          <section className={FORM_SECTION_CLASSNAME}>
              <h2 className={FORM_SECTION_CLASS}>積分商城設定</h2>
              <p className="font-sans text-[11px] text-text-secondary">
                會員可在獎勵頁使用積分兌換此券；無需觸發條件，與搶券活動互斥。
              </p>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="catalog-points-cost" className={FORM_LABEL_CLASS}>
                    兌換積分
                  </Label>
                  <Input
                    id="catalog-points-cost"
                    type="number"
                    min={1}
                    value={String(redemptionCatalog.points_cost)}
                    onChange={(event) =>
                      handleChange({
                        ...form,
                        redemption_catalog: {
                          ...redemptionCatalog,
                          enabled: true,
                          is_active: true,
                          points_cost: Number(event.target.value || 0),
                        },
                      })
                    }
                    className={FORM_INPUT_CLASS}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="catalog-stock" className={FORM_LABEL_CLASS}>
                    商城庫存
                  </Label>
                  <Input
                    id="catalog-stock"
                    type="number"
                    min={0}
                    value={String(redemptionCatalog.stock)}
                    onChange={(event) =>
                      handleChange({
                        ...form,
                        redemption_catalog: {
                          ...redemptionCatalog,
                          enabled: true,
                          is_active: true,
                          stock: Number(event.target.value || 0),
                        },
                      })
                    }
                    className={FORM_INPUT_CLASS}
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="catalog-max-per-user" className={FORM_LABEL_CLASS}>
                    每人限兌（終身）
                  </Label>
                  <Input
                    id="catalog-max-per-user"
                    type="number"
                    min={1}
                    placeholder="留空表示不限"
                    value={
                      redemptionCatalog.max_redemptions_per_user == null
                        ? ""
                        : String(redemptionCatalog.max_redemptions_per_user)
                    }
                    onChange={(event) => {
                      const raw = event.target.value.trim();
                      handleChange({
                        ...form,
                        redemption_catalog: {
                          ...redemptionCatalog,
                          enabled: true,
                          is_active: true,
                          max_redemptions_per_user:
                            raw === "" ? null : Number(raw || 0),
                        },
                      });
                    }}
                    className={FORM_INPUT_CLASS}
                  />
                </div>
              </div>
          </section>
        ) : null}
      </div>

      <div className={FORM_STICKY_FOOTER_CLASS}>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={saveDraft}
            disabled={isPending || isLegacyCheckInTrigger}
            className={`${BTN_OUTLINE_CLASS} min-w-0 flex-1 disabled:opacity-50 disabled:pointer-events-none`}
          >
            儲存草稿
          </button>
          <button
            type="button"
            onClick={publish}
            disabled={isPending || isLegacyCheckInTrigger}
            className={`${BTN_PRIMARY_CLASS} min-w-0 flex-1 disabled:opacity-50 disabled:pointer-events-none`}
          >
            {isPending ? "處理中…" : "發布"}
          </button>
        </div>
      </div>
    </div>
  );
}
