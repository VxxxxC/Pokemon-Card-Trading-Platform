import { buildDefaultActivityForm } from "@/lib/admin-rewards/template-form";
import type {
  AdminRewardActivityUpsertInput,
  AdminRewardTemplateFlashSchedule,
  AdminRewardTemplateRestrictions,
} from "@/lib/admin-rewards/types";
import { DEFAULT_ADMIN_REWARD_RESTRICTIONS } from "@/lib/admin-rewards/types";

export const MATRIX_PREFIX = "Vitest Matrix";

export function uniqueTitle(caseId: string, runId: string): string {
  return `${MATRIX_PREFIX} ${runId} ${caseId}`;
}

export function buildOpenActivityWindow(): { startsAt: string; endsAt: string } {
  const now = Date.now();
  const pad = (value: number) => String(value).padStart(2, "0");
  const toLocal = (date: Date) =>
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  return {
    startsAt: toLocal(new Date(now - 2 * 60 * 60 * 1000)),
    endsAt: toLocal(new Date(now + 48 * 60 * 60 * 1000)),
  };
}

function toLocalDateTime(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Hong_Kong",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "00";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}:00+08:00`;
}

export function buildFlashSchedule(campaignName: string): AdminRewardTemplateFlashSchedule {
  const now = Date.now();
  const starts = new Date(now - 2 * 60 * 60 * 1000);
  const ends = new Date(now + 24 * 60 * 60 * 1000);
  return {
    campaign_name: campaignName,
    starts_at: toLocalDateTime(starts),
    ends_at: toLocalDateTime(ends),
    max_claims: 3,
    max_claims_per_user: 1,
    override_valid_days: null,
  };
}

function withActivityWindow(
  input: AdminRewardActivityUpsertInput,
  title: string,
): AdminRewardActivityUpsertInput {
  const window = buildOpenActivityWindow();
  return {
    ...input,
    title,
    schedule: {
      name: title,
      starts_at: window.startsAt,
      ends_at: window.endsAt,
      max_claims: 2147483647,
      max_claims_per_user: 1,
      override_valid_days: null,
    },
  };
}

export function buildAutoGrantDiscountInput(
  title: string,
): AdminRewardActivityUpsertInput {
  const base = buildDefaultActivityForm();
  return withActivityWindow(
    {
      ...base,
      type: "discount_coupon",
      reward_value: { amount_hkd: 15, min_spend_hkd: 0 },
      distribution_mode: "auto_grant",
      trigger_conditions: {
        kind: "trade_count",
        role: "buyer",
        count: 1,
      },
    },
    title,
  );
}

export function buildAutoGrantPointsInput(
  title: string,
): AdminRewardActivityUpsertInput {
  const base = buildDefaultActivityForm();
  return withActivityWindow(
    {
      ...base,
      type: "points",
      reward_value: { points: 77 },
      distribution_mode: "auto_grant",
      trigger_conditions: {
        kind: "trade_count",
        role: "buyer",
        count: 1,
      },
    },
    title,
  );
}

export function buildAutoGrantProfileCompleteInput(
  title: string,
): AdminRewardActivityUpsertInput {
  const base = buildDefaultActivityForm();
  return withActivityWindow(
    {
      ...base,
      type: "discount_coupon",
      reward_value: { amount_hkd: 10, min_spend_hkd: 0 },
      distribution_mode: "auto_grant",
      trigger_conditions: {
        kind: "event_once",
        event: "profile_complete",
      },
    },
    title,
  );
}

const DIRECT_ONLY_RESTRICTIONS: AdminRewardTemplateRestrictions = {
  ...DEFAULT_ADMIN_REWARD_RESTRICTIONS,
  requires_authentication: "false",
};

export function buildDirectOnlyDiscountInput(
  title: string,
): AdminRewardActivityUpsertInput {
  return {
    ...buildAutoGrantDiscountInput(title),
    restrictions: DIRECT_ONLY_RESTRICTIONS,
  };
}

export function buildFutureFlashSchedule(
  campaignName: string,
  hoursAhead = 2,
): AdminRewardTemplateFlashSchedule {
  const now = Date.now();
  const starts = new Date(now + hoursAhead * 60 * 60 * 1000);
  const ends = new Date(now + 48 * 60 * 60 * 1000);

  return {
    campaign_name: campaignName,
    starts_at: toLocalDateTime(starts),
    ends_at: toLocalDateTime(ends),
    max_claims: 3,
    max_claims_per_user: 1,
    override_valid_days: null,
  };
}

export function buildFutureFlashFreeShipInput(
  title: string,
  campaignName: string,
  hoursAhead = 2,
): AdminRewardActivityUpsertInput {
  const base = buildDefaultActivityForm();
  const flashSchedule = buildFutureFlashSchedule(campaignName, hoursAhead);
  return {
    ...base,
    title,
    type: "free_shipping",
    reward_value: { max_subsidy_hkd: 20, min_spend_hkd: 0 },
    distribution_mode: "flash_only",
    trigger_conditions: { kind: "none" },
    flash_schedule: flashSchedule,
    schedule: {
      name: campaignName,
      campaign_name: campaignName,
      starts_at: flashSchedule.starts_at,
      ends_at: flashSchedule.ends_at,
      max_claims: flashSchedule.max_claims,
      max_claims_per_user: flashSchedule.max_claims_per_user,
      override_valid_days: null,
    },
  };
}

export function buildAuthFreeShippingInput(
  title: string,
): AdminRewardActivityUpsertInput {
  const base = buildDefaultActivityForm();
  return withActivityWindow(
    {
      ...base,
      type: "free_shipping",
      reward_value: { max_subsidy_hkd: 30, min_spend_hkd: 0 },
      distribution_mode: "auto_grant",
      trigger_conditions: {
        kind: "trade_count",
        role: "buyer",
        count: 1,
      },
    },
    title,
  );
}

/** @rpc-edge-only — C2C member checkout RPC cases; not Admin default-form contract (see admin-publish-defaults.integration). */
export function buildMemberAuthFreeShippingInput(
  title: string,
): AdminRewardActivityUpsertInput {
  const base = buildAuthFreeShippingInput(title);
  return {
    ...base,
    restrictions: {
      ...DEFAULT_ADMIN_REWARD_RESTRICTIONS,
      order_kinds: ["merchant", "member"],
      requires_authentication: "any",
    },
  };
}

export function buildPointsCatalogDiscountInput(
  title: string,
  options?: {
    pointsCost?: number;
    stock?: number;
    maxRedemptionsPerUser?: number | null;
  },
): AdminRewardActivityUpsertInput {
  const base = buildAutoGrantDiscountInput(title);
  return {
    ...base,
    trigger_conditions: { kind: "none" },
    redemption_catalog: {
      enabled: true,
      points_cost: options?.pointsCost ?? 100,
      stock: options?.stock ?? 5,
      is_active: true,
      display_order: 0,
      max_redemptions_per_user: options?.maxRedemptionsPerUser ?? null,
    },
  };
}

export function buildFlashWithCatalogConflictInput(
  title: string,
  campaignName: string,
): AdminRewardActivityUpsertInput {
  return {
    ...buildFlashFreeShipInput(title, campaignName),
    redemption_catalog: {
      enabled: true,
      points_cost: 100,
      stock: 5,
      is_active: true,
      display_order: 0,
    },
  };
}

export function buildFlashFreeShipInput(
  title: string,
  campaignName: string,
): AdminRewardActivityUpsertInput {
  const base = buildDefaultActivityForm();
  const flashSchedule = buildFlashSchedule(campaignName);
  return {
    ...base,
    title,
    type: "free_shipping",
    reward_value: { max_subsidy_hkd: 20, min_spend_hkd: 0 },
    distribution_mode: "flash_only",
    trigger_conditions: { kind: "none" },
    flash_schedule: flashSchedule,
    schedule: {
      name: campaignName,
      campaign_name: campaignName,
      starts_at: flashSchedule.starts_at,
      ends_at: flashSchedule.ends_at,
      max_claims: flashSchedule.max_claims,
      max_claims_per_user: flashSchedule.max_claims_per_user,
      override_valid_days: null,
    },
  };
}
