import type {
  DiscountCouponRewardValue,
  FreeShippingRewardValue,
} from "@/lib/constants/rewards";
import { classifyCouponTab } from "@/lib/rewards/coupon-expiry";

export type UserCouponTab = "redeemable" | "redeemed" | "expired";

/** Wallet tabs + catalog preview for not-yet-eligible templates */
export type CouponCenterTab = UserCouponTab | "locked";

export type UserCouponView = {
  id: string;
  name: string;
  code: string;
  valueLabel: string;
  minSpendLabel: string;
  expiryDate: string;
  type: "shipping" | "cash" | "auth_discount";
};

export type LockedRewardView = {
  id: string;
  name: string;
  valueLabel: string;
  minSpendLabel: string;
  requirementLabel: string;
  progressLabel: string;
  progressCurrent: number;
  progressRequired: number;
  ctaHref: string;
  stockRemaining: number | null;
  footerNote: string;
  type: UserCouponView["type"];
};

export type RewardCouponCenterView = {
  wallet: Record<UserCouponTab, UserCouponView[]>;
  locked: LockedRewardView[];
};

type UserRewardRow = {
  id: string;
  is_used: boolean | null;
  calculated_expiry: string | null;
  used_at: string | null;
  template: {
    title: string;
    description: string | null;
    type: string;
    reward_value: unknown;
  } | null;
};

function isUserRewardRow(value: unknown): value is UserRewardRow {
  if (typeof value !== "object" || value === null) return false;
  const row = value as Record<string, unknown>;
  return typeof row.id === "string";
}

export function parseUserRewardCouponRows(raw: unknown): UserRewardRow[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(isUserRewardRow);
}

function formatExpiryZh(iso: string | null): string {
  if (!iso) return "無限期";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.getFullYear()}年 ${d.getMonth() + 1}月${d.getDate()}日`;
}

function mapValueLabel(
  templateType: string,
  rewardValue: unknown,
): string {
  if (templateType === "free_shipping") {
    return "免運費";
  }

  if (templateType === "discount_coupon") {
    const v = rewardValue as DiscountCouponRewardValue;
    if (v?.amount_hkd != null) {
      return `HK$ ${v.amount_hkd.toLocaleString("en-HK")}`;
    }
    if (v?.percent_off != null) {
      return `${v.percent_off}% OFF`;
    }
    return "折扣券";
  }

  return "優惠券";
}

function mapMinSpendLabel(
  templateType: string,
  description: string | null,
  rewardValue: unknown,
): string {
  if (description?.trim()) {
    return description.trim();
  }

  const v = rewardValue as DiscountCouponRewardValue & FreeShippingRewardValue;
  if (v?.min_spend_hkd != null) {
    return `滿 HK$${v.min_spend_hkd.toLocaleString("en-HK")} 適用`;
  }

  if (templateType === "free_shipping") {
    return "指定訂單免運費";
  }

  return "平台折價券";
}

function mapUiType(templateType: string): UserCouponView["type"] {
  if (templateType === "free_shipping") return "shipping";
  return "cash";
}

function buildCouponCode(
  userRewardId: string,
  rewardValue: unknown,
): string {
  const prefix =
    typeof rewardValue === "object" &&
    rewardValue !== null &&
    "code_prefix" in rewardValue &&
    typeof (rewardValue as { code_prefix?: string }).code_prefix === "string"
      ? (rewardValue as { code_prefix: string }).code_prefix
      : "HKCV";
  return `${prefix}-${userRewardId.replace(/-/g, "").slice(0, 8).toUpperCase()}`;
}

export function mapUserRewardRowToCoupon(
  row: UserRewardRow,
  tab: UserCouponTab,
): UserCouponView {
  const template = row.template;
  const title = template?.title ?? "平台折價券";
  const rewardValue = template?.reward_value ?? null;
  const templateType = template?.type ?? "discount_coupon";

  let expiryDate = formatExpiryZh(row.calculated_expiry);
  if (tab === "redeemed" && row.used_at) {
    const used = new Date(row.used_at);
    expiryDate = Number.isNaN(used.getTime())
      ? `已於 ${row.used_at} 使用`
      : `已於 ${used.getFullYear()}/${String(used.getMonth() + 1).padStart(2, "0")}/${String(used.getDate()).padStart(2, "0")} 使用`;
  } else if (tab === "expired") {
    expiryDate = `已於 ${formatExpiryZh(row.calculated_expiry)} 過期`;
  }

  return {
    id: row.id,
    name: title,
    code: buildCouponCode(row.id, rewardValue),
    valueLabel: mapValueLabel(templateType, rewardValue),
    minSpendLabel: mapMinSpendLabel(
      templateType,
      template?.description ?? null,
      rewardValue,
    ),
    expiryDate,
    type: mapUiType(templateType),
  };
}

export function groupUserRewardCoupons(rows: UserRewardRow[]): Record<
  UserCouponTab,
  UserCouponView[]
> {
  const now = new Date();
  const grouped: Record<UserCouponTab, UserCouponView[]> = {
    redeemable: [],
    redeemed: [],
    expired: [],
  };

  for (const row of rows) {
    const tab = classifyCouponTab(row, now);
    grouped[tab].push(mapUserRewardRowToCoupon(row, tab));
  }

  return grouped;
}

type LockedTemplateRow = {
  template_id: string;
  title: string;
  description: string | null;
  type: string;
  reward_value: unknown;
  progress: {
    progress_current?: number;
    progress_required?: number;
    progress_label?: string;
    requirement_label?: string;
    cta_href?: string;
    stock_remaining?: number | null;
  } | null;
};

function isLockedTemplateRow(value: unknown): value is LockedTemplateRow {
  if (typeof value !== "object" || value === null) return false;
  const row = value as Record<string, unknown>;
  return typeof row.template_id === "string" && typeof row.title === "string";
}

export function mapLockedTemplateRowToView(row: LockedTemplateRow): LockedRewardView {
  const progress = row.progress ?? {};
  const templateType = row.type ?? "discount_coupon";
  const rewardValue = row.reward_value ?? null;
  const stockRemaining =
    typeof progress.stock_remaining === "number" ? progress.stock_remaining : null;

  let footerNote = "完成條件後自動發放";
  if (stockRemaining != null) {
    footerNote = `全平台剩餘 ${stockRemaining.toLocaleString("en-HK")} 張`;
  }

  return {
    id: row.template_id,
    name: row.title,
    valueLabel: mapValueLabel(templateType, rewardValue),
    minSpendLabel: mapMinSpendLabel(
      templateType,
      row.description,
      rewardValue,
    ),
    requirementLabel:
      typeof progress.requirement_label === "string"
        ? progress.requirement_label
        : "完成指定條件",
    progressLabel:
      typeof progress.progress_label === "string"
        ? progress.progress_label
        : "0 / 1",
    progressCurrent: Number(progress.progress_current ?? 0),
    progressRequired: Math.max(Number(progress.progress_required ?? 1), 1),
    ctaHref:
      typeof progress.cta_href === "string" ? progress.cta_href : "/profile/user/rewards",
    stockRemaining,
    footerNote,
    type: mapUiType(templateType),
  };
}

export function parseRewardCouponCenter(raw: unknown): RewardCouponCenterView {
  const payload =
    typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : {};

  const walletRows = parseUserRewardCouponRows(payload.wallet);
  const lockedRows = Array.isArray(payload.locked)
    ? payload.locked.filter(isLockedTemplateRow)
    : [];

  return {
    wallet: groupUserRewardCoupons(walletRows),
    locked: lockedRows.map(mapLockedTemplateRowToView),
  };
}
