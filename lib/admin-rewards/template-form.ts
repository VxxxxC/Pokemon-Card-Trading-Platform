import {
  DEFAULT_ADMIN_REWARD_RESTRICTIONS,
  type AdminRewardTemplateRestrictions,
  type AdminRedemptionCatalogInput,
  type AdminRewardActivityRow,
  type AdminRewardActivityUpsertInput,
  type AdminRewardDistributionMode,
  type AdminRewardTemplateFlashSchedule,
  type AdminRewardTemplateRow,
  type AdminRewardTemplateStatus,
  type AdminRewardTemplateType,
  type AdminRewardTemplateUpsertInput,
} from "@/lib/admin-rewards/types";
import { formatHongKongDateTimeSlash } from "@/lib/datetime/hong-kong";

const CATALOG_ELIGIBLE_TYPES = new Set<AdminRewardTemplateType>([
  "discount_coupon",
  "free_shipping",
]);

export type AdminRewardFormFlow = "general" | "points_mall";

export const FORM_FLOW_LABELS: Record<AdminRewardFormFlow, string> = {
  general: "一般獎勵券",
  points_mall: "積分商城商品",
};

export const FORM_FLOW_DESCRIPTIONS: Record<AdminRewardFormFlow, string> = {
  general: "條件達成自動發放、限時搶領等傳統發券方式",
  points_mall: "會員以積分兌換折扣券或免運券，無觸發條件",
};

export function isCatalogEligibleRewardType(
  type: AdminRewardTemplateType,
): boolean {
  return CATALOG_ELIGIBLE_TYPES.has(type);
}

export function isRedemptionCatalogEnabled(
  catalog: AdminRedemptionCatalogInput | null | undefined,
): boolean {
  return catalog?.enabled === true;
}

export function shouldShowRedemptionCatalog(
  type: AdminRewardTemplateType,
  distributionMode: AdminRewardDistributionMode | undefined,
): boolean {
  return (
    isCatalogEligibleRewardType(type) && distributionMode !== "flash_only"
  );
}

export function shouldShowAutoGrantTriggers(
  distributionMode: AdminRewardDistributionMode | undefined,
  catalog: AdminRedemptionCatalogInput | null | undefined,
  formFlow: AdminRewardFormFlow = "general",
): boolean {
  if (formFlow === "points_mall") {
    return false;
  }
  return (
    (distributionMode ?? "auto_grant") === "auto_grant" &&
    !isRedemptionCatalogEnabled(catalog)
  );
}

export function deriveFormFlow(
  form: AdminRewardActivityUpsertInput,
): AdminRewardFormFlow {
  if (isRedemptionCatalogEnabled(form.redemption_catalog)) {
    return "points_mall";
  }
  return "general";
}

export function buildDefaultPointsMallActivityForm(): AdminRewardActivityUpsertInput {
  return {
    ...buildDefaultActivityForm(),
    type: "discount_coupon",
    reward_value: rewardValueForType("discount_coupon"),
    trigger_conditions: { kind: "none" },
    redemption_catalog: {
      enabled: true,
      points_cost: 500,
      stock: 100,
      is_active: true,
      max_redemptions_per_user: null,
    },
  };
}

export function applyFormFlow(
  form: AdminRewardActivityUpsertInput,
  flow: AdminRewardFormFlow,
): AdminRewardActivityUpsertInput {
  if (flow === "points_mall") {
    const nextType = isCatalogEligibleRewardType(form.type)
      ? form.type
      : "discount_coupon";
    return {
      ...form,
      type: nextType,
      reward_value: isCatalogEligibleRewardType(form.type)
        ? form.reward_value
        : rewardValueForType("discount_coupon"),
      distribution_mode: "auto_grant",
      trigger_conditions: { kind: "none" },
      schedule: form.schedule,
      flash_schedule: undefined,
      redemption_catalog: {
        enabled: true,
        points_cost: form.redemption_catalog?.points_cost ?? 500,
        stock: form.redemption_catalog?.stock ?? 100,
        is_active: true,
        display_order: form.redemption_catalog?.display_order,
        max_redemptions_per_user:
          form.redemption_catalog?.max_redemptions_per_user ?? null,
      },
    };
  }

  const restoreTriggers =
    isRedemptionCatalogEnabled(form.redemption_catalog) ||
    form.trigger_conditions.kind === "none";

  return {
    ...form,
    redemption_catalog: undefined,
    trigger_conditions: restoreTriggers
      ? {
          kind: "event_once",
          event: "profile_complete",
          once_per_user: true,
        }
      : form.trigger_conditions,
    distribution_mode:
      form.distribution_mode === "flash_only"
        ? "flash_only"
        : (form.distribution_mode ?? "auto_grant"),
  };
}

export function sanitizeRedemptionCatalogForType(
  type: AdminRewardTemplateType,
  catalog: AdminRedemptionCatalogInput | null | undefined,
): AdminRedemptionCatalogInput | undefined {
  if (!catalog || !isCatalogEligibleRewardType(type)) {
    return undefined;
  }
  return catalog;
}

export function resolveActivityTriggerConditions(
  input: AdminRewardActivityUpsertInput,
): Record<string, unknown> {
  const distributionMode = input.distribution_mode ?? "auto_grant";
  if (distributionMode === "flash_only") {
    return { kind: "none" };
  }
  if (isRedemptionCatalogEnabled(input.redemption_catalog)) {
    return { kind: "none" };
  }
  return input.trigger_conditions;
}

export const TYPE_LABELS: Record<AdminRewardTemplateType, string> = {
  points: "積分",
  discount_coupon: "折扣券",
  free_shipping: "免運券",
};

export const STATUS_LABELS: Record<AdminRewardTemplateStatus, string> = {
  draft: "草稿",
  active: "已發布",
  archived: "已封存",
};

export function buildDefaultFlashSchedule(): AdminRewardTemplateFlashSchedule {
  const now = new Date();
  const starts = new Date(now.getTime() + 5 * 60 * 1000);
  const ends = new Date(starts.getTime() + 24 * 60 * 60 * 1000);
  return {
    campaign_name: "",
    starts_at: starts.toISOString().slice(0, 16),
    ends_at: ends.toISOString().slice(0, 16),
    max_claims: 100,
    max_claims_per_user: 1,
    override_valid_days: null,
  };
}

export const DISTRIBUTION_MODE_LABELS = {
  auto_grant: "條件達成自動發放",
  flash_only: "限時搶領（先到先得）",
} as const;

export const DISPLAY_STATUS_LABELS: Record<string, string> = {
  draft: "草稿",
  active: "進行中",
  paused: "已暫停",
  ended: "已結束",
  archived: "已封存",
};

export const TRIGGER_KIND_LABELS: Record<string, string> = {
  none: "無（限時搶領）",
  event_once: "一次性事件",
  trade_count: "成交筆數",
  check_in_streak: "連續簽到",
  check_in_cycle_day: "簽到週期",
};

export const EVENT_ONCE_LABELS: Record<string, string> = {
  profile_complete: "完善個人資料",
  first_listing: "首次上架",
  first_chat: "首次聊天",
  account_registered: "註冊完成",
};

export const TRADE_ROLE_LABELS: Record<string, string> = {
  buyer: "買家",
  seller: "賣家",
  merchant: "商戶",
};

export function formatActivityIdShort(activityId: string): string {
  const trimmed = activityId.trim();
  if (trimmed.length <= 8) {
    return trimmed;
  }
  return trimmed.slice(0, 8);
}

export function formatTriggerConditionLabel(
  triggerConditions: Record<string, unknown>,
  distributionMode?: AdminRewardActivityRow["distribution_mode"],
): string {
  if (distributionMode === "flash_only") {
    return TRIGGER_KIND_LABELS.none;
  }

  const kind = String(triggerConditions.kind ?? "none");

  if (kind === "event_once") {
    const event = String(triggerConditions.event ?? "profile_complete");
    const eventLabel = EVENT_ONCE_LABELS[event] ?? event;
    return `${TRIGGER_KIND_LABELS.event_once} · ${eventLabel}`;
  }

  if (kind === "trade_count") {
    const role = String(triggerConditions.role ?? "buyer");
    const threshold = triggerConditions.threshold;
    const roleLabel = TRADE_ROLE_LABELS[role] ?? role;
    const count =
      typeof threshold === "number"
        ? threshold
        : Number(triggerConditions.trade_count ?? triggerConditions.count ?? 0);
    return `${TRIGGER_KIND_LABELS.trade_count} · ${roleLabel} ${count} 筆`;
  }

  return TRIGGER_KIND_LABELS[kind] ?? kind;
}

export function formatRewardActivityValue(row: AdminRewardActivityRow): string {
  const value = row.reward_value ?? {};

  if (row.type === "points") {
    const points = Number(value.points ?? 0);
    return `平台積分 ${points} pt`;
  }

  if (row.type === "discount_coupon") {
    const amount = Number(value.amount_hkd ?? 0);
    const minSpend = Number(value.min_spend_hkd ?? 0);
    if (minSpend > 0) {
      return `立減 HK$ ${amount}（滿 HK$ ${minSpend}）`;
    }
    return `立減 HK$ ${amount}`;
  }

  const maxSubsidy = Number(value.max_subsidy_hkd ?? 0);
  const minSpend = Number(value.min_spend_hkd ?? 0);
  if (minSpend > 0) {
    return `免運補貼 HK$ ${maxSubsidy}（滿 HK$ ${minSpend}）`;
  }
  return `免運補貼 HK$ ${maxSubsidy}`;
}

export function formatActivityValidityPeriod(row: AdminRewardActivityRow): string {
  if (row.distribution_mode === "flash_only" && row.starts_at && row.ends_at) {
    return `${formatHongKongDateTimeSlash(row.starts_at)} — ${formatHongKongDateTimeSlash(row.ends_at)}`;
  }

  if (row.fixed_expiry_date) {
    return `固定到期 ${new Date(row.fixed_expiry_date).toLocaleDateString("zh-HK")}`;
  }

  if (row.valid_duration_days != null && row.valid_duration_days > 0) {
    return `領取後 ${row.valid_duration_days} 日有效`;
  }

  return "跟隨模板有效期";
}

export function activityMatchesSearch(
  row: AdminRewardActivityRow,
  query: string,
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) {
    return true;
  }

  const shortId = formatActivityIdShort(row.activity_id).toLowerCase();
  const haystack = [
    row.title,
    row.activity_id,
    shortId,
    `#${shortId}`,
    TYPE_LABELS[row.type],
    DISTRIBUTION_MODE_LABELS[row.distribution_mode],
    formatRewardActivityValue(row),
    formatTriggerConditionLabel(row.trigger_conditions, row.distribution_mode),
  ]
    .join(" ")
    .toLowerCase();

  return haystack.includes(q);
}

export const REWARD_ACTIVITY_PAGE_SIZE = 30;

export function buildDefaultActivityForm(): AdminRewardActivityUpsertInput {
  return buildDefaultForm();
}

export function buildDefaultForm(): AdminRewardTemplateUpsertInput {
  return {
    title: "",
    description: "",
    type: "discount_coupon",
    reward_value: { amount_hkd: 10, min_spend_hkd: 100 },
    trigger_conditions: {
      kind: "event_once",
      event: "profile_complete",
      once_per_user: true,
    },
    is_infinite: true,
    max_claims: null,
    valid_duration_days: 30,
    fixed_expiry_date: null,
    distribution_mode: "auto_grant",
    restrictions: { ...DEFAULT_ADMIN_REWARD_RESTRICTIONS },
  };
}

export function activityRowToForm(
  row: AdminRewardActivityRow,
): AdminRewardActivityUpsertInput {
  const form: AdminRewardActivityUpsertInput = {
    ...rowToForm(row),
  };

  if (row.redemption_catalog && isCatalogEligibleRewardType(row.type)) {
    form.redemption_catalog = {
      enabled: row.redemption_catalog.enabled,
      points_cost: row.redemption_catalog.points_cost,
      stock: row.redemption_catalog.stock,
      is_active: row.redemption_catalog.is_active,
      display_order: row.redemption_catalog.display_order ?? 0,
      max_redemptions_per_user:
        row.redemption_catalog.max_redemptions_per_user ?? null,
    };
  }

  if (row.starts_at && row.ends_at) {
    const scheduleFields = {
      campaign_id: row.campaign_id ?? undefined,
      campaign_name: row.campaign_name ?? row.title,
      starts_at: isoToLocalDateTime(row.starts_at),
      ends_at: isoToLocalDateTime(row.ends_at),
      max_claims: row.campaign_max_claims ?? 100,
      max_claims_per_user: row.max_claims_per_user ?? 1,
      override_valid_days: row.override_valid_days,
    };
    form.schedule = {
      name: row.campaign_name ?? row.title,
      ...scheduleFields,
    };
    if (row.distribution_mode === "flash_only") {
      form.distribution_mode = "flash_only";
      form.trigger_conditions = { kind: "none" };
      form.flash_schedule = {
        ...scheduleFields,
      };
    }
  }

  return form;
}

function isoToLocalDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function rowToForm(
  row: AdminRewardTemplateRow,
): AdminRewardTemplateUpsertInput {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    type: row.type,
    reward_value: row.reward_value,
    trigger_conditions: row.trigger_conditions,
    is_infinite: row.is_infinite ?? true,
    max_claims: row.max_claims,
    valid_duration_days: row.valid_duration_days,
    fixed_expiry_date: row.fixed_expiry_date,
    distribution_mode: row.distribution_mode,
    restrictions: row.restrictions,
  };
}

export function formatActivityStock(row: AdminRewardActivityRow): string {
  if (row.distribution_mode === "flash_only") {
    const claimed = row.campaign_claimed_count ?? 0;
    const max = row.campaign_max_claims ?? 0;
    return `${claimed} / ${max}`;
  }
  return formatStock(row);
}

export function formatStock(row: AdminRewardTemplateRow): string {
  if (row.is_infinite) {
    return "無限";
  }
  return `${row.claimed_count} / ${row.max_claims ?? 0}`;
}

export type OrderKindsScope = "merchant" | "member" | "both";

export const ORDER_KINDS_SCOPE_LABELS: Record<OrderKindsScope, string> = {
  merchant: "僅商戶訂單 (B2C)",
  member: "僅會員訂單 (C2C)",
  both: "商戶 + 會員 (B2C & C2C)",
};

export function orderKindsToScope(
  orderKinds: ("merchant" | "member")[],
): OrderKindsScope {
  const hasMerchant = orderKinds.includes("merchant");
  const hasMember = orderKinds.includes("member");
  if (hasMerchant && hasMember) {
    return "both";
  }
  if (hasMember) {
    return "member";
  }
  return "merchant";
}

export function scopeToOrderKinds(
  scope: OrderKindsScope,
): ("merchant" | "member")[] {
  if (scope === "both") {
    return ["merchant", "member"];
  }
  if (scope === "member") {
    return ["member"];
  }
  return ["merchant"];
}

/** Checkout-facing defaults: free_shipping spans B2C + C2C auth; discount stays B2C-only. */
export function defaultRestrictionsForRewardType(
  type: AdminRewardTemplateType,
): AdminRewardTemplateRestrictions {
  if (type === "free_shipping") {
    return {
      ...DEFAULT_ADMIN_REWARD_RESTRICTIONS,
      order_kinds: ["merchant", "member"],
    };
  }
  return { ...DEFAULT_ADMIN_REWARD_RESTRICTIONS };
}

export function restrictionsForTypeChange(
  type: AdminRewardTemplateType,
  current?: AdminRewardTemplateRestrictions,
): AdminRewardTemplateRestrictions {
  const defaults = defaultRestrictionsForRewardType(type);
  if (!current) {
    return defaults;
  }

  const scope = orderKindsToScope(current.order_kinds);
  if (type === "free_shipping" && scope === "merchant") {
    return { ...current, order_kinds: defaults.order_kinds };
  }

  return {
    ...current,
    order_kinds: current.order_kinds.length > 0 ? current.order_kinds : defaults.order_kinds,
  };
}

export function rewardValueForType(
  type: AdminRewardTemplateType,
): Record<string, unknown> {
  if (type === "points") {
    return { points: 100 };
  }
  if (type === "discount_coupon") {
    return { amount_hkd: 10, min_spend_hkd: 100 };
  }
  return { max_subsidy_hkd: 30, min_spend_hkd: 0 };
}
