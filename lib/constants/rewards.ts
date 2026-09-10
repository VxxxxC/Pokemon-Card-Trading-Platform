/**
 * HKCardVault - 獎勵與積分系統常量（cold-start seed 與 UI 共用）
 * 每日簽到積分 SSOT：check_in_program.daily_rewards（DB）；以下為 fallback / CI
 */

/** 7 日循環簽到積分階梯 fallback（第 N 天 → PTS） */
export const CHECK_IN_POINT_LADDER: Readonly<Record<number, number>> = {
  1: 10,
  2: 15,
  3: 20,
  4: 25,
  5: 30,
  6: 40,
  7: 100,
} as const;

export const CHECK_IN_CYCLE_DAYS = 7;

export const CHECK_IN_STEPS = Object.entries(CHECK_IN_POINT_LADDER).map(
  ([day, points]) => ({
    dayNum: Number(day),
    points,
    label: Number(day) === 7 ? '大禮包' : `第${day}天`,
  }),
);

/** point_ledger.source_type — 須與 DB CHECK / RPC 一致；餘額只經 fn_apply_point_transaction 更新 */
export const POINT_LEDGER_SOURCES = {
  DAILY_CHECK_IN: 'daily_check_in',
  REWARD_TEMPLATE: 'reward_template',
  MISSION_CLAIM: 'mission_claim',
  ADMIN_ADJUST: 'admin_adjust',
  REDEMPTION: 'redemption',
} as const;

export type PointLedgerSource =
  (typeof POINT_LEDGER_SOURCES)[keyof typeof POINT_LEDGER_SOURCES];

/** reward_templates.type = 'points' 時 reward_value 形狀 */
export interface PointsRewardValue {
  points: number;
}

/** Hard-coded seed template IDs（migration seed 使用固定 UUID） */
export const SEED_REWARD_TEMPLATE_IDS = {
  /** @deprecated archived — use check_in_program completion flow */
  CHECK_IN_DAY7_BONUS: 'a1000001-0001-4001-8001-000000000001',
  CHECK_IN_PROGRAM_COMPLETION: 'b1000001-0001-4001-8001-000000000020',
  CHECK_IN_PROGRAM_ID: 'b1000001-0001-4001-8001-000000000001',
  ONBOARD_FIRST_TRADE: 'a1000001-0001-4001-8001-000000000002',
  /** @deprecated archived — check-in milestones via 簽到計劃 (future phase) */
  STREAK_30_LUCKY_DRAW: 'a1000001-0001-4001-8001-000000000003',
  LIMITED_HK10_COUPON: 'a1000001-0001-4001-8001-000000000010',
  /** @deprecated v2 前封存 — 香港抽獎牌照 */
  LIMITED_SPRING_LUCKY_DRAW: 'a1000001-0001-4001-8001-000000000011',
  HK2_PROFILE_COUPON: 'a1000001-0001-4001-8001-000000000012',
} as const;

/** v2 前暫停；DB 內 lucky_draw_ticket 模板已 is_active=false */
export const LUCKY_DRAW_ARCHIVED = true;

/** reward_templates.type = 'discount_coupon' */
export interface DiscountCouponRewardValue {
  amount_hkd?: number;
  percent_off?: number;
  min_spend_hkd?: number;
  code_prefix?: string;
}

/** reward_templates.type = 'free_shipping' */
export interface FreeShippingRewardValue {
  min_spend_hkd?: number;
  code_prefix?: string;
}

/**
 * reward_templates.type = 'lucky_draw_ticket'
 * 票券本身存入 user_rewards；實際開獎需另建 draw / draw_entries 流程
 */
export interface LuckyDrawTicketRewardValue {
  draw_id: string;
  draw_name_zh: string;
}

export interface RewardTemplateInventory {
  isInfinite: boolean;
  maxClaims: number | null;
  claimedCount: number;
  remaining: number | null;
}

export function getRewardTemplateRemainingStock(
  isInfinite: boolean | null | undefined,
  maxClaims: number | null | undefined,
  claimedCount: number | null | undefined,
): number | null {
  if (isInfinite) return null;
  if (maxClaims == null || maxClaims <= 0) return 0;
  return Math.max(0, maxClaims - (claimedCount ?? 0));
}

export function getCheckInPointsForCycleDay(cycleDay: number): number {
  const day = ((cycleDay - 1) % CHECK_IN_CYCLE_DAYS) + 1;
  return CHECK_IN_POINT_LADDER[day] ?? CHECK_IN_POINT_LADDER[1];
}

export function getCheckInCycleDayFromStreak(streak: number): number {
  if (streak < 1) return 1;
  return ((streak - 1) % CHECK_IN_CYCLE_DAYS) + 1;
}

export type RewardTemplateType =
  | 'points'
  | 'discount_coupon'
  | 'free_shipping'
  | 'lucky_draw_ticket';

export interface UnacknowledgedRewardGrant {
  userRewardId: string;
  templateId: string;
  title: string;
  description: string | null;
  type: RewardTemplateType | string;
  rewardValue: unknown;
  pointsGranted: number | null;
}

export const REWARD_TYPE_LABELS: Record<string, string> = {
  points: '積分獎勵',
  discount_coupon: '折扣優惠券',
  free_shipping: '免運費券',
  lucky_draw_ticket: '抽獎券',
};

export function parseRewardGrantRows(raw: unknown): UnacknowledgedRewardGrant[] {
  if (!Array.isArray(raw)) return [];

  return raw.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const row = item as Record<string, unknown>;
    const userRewardId = row.user_reward_id;
    const templateId = row.template_id;
    const title = row.title;
    if (typeof userRewardId !== 'string' || typeof templateId !== 'string') {
      return [];
    }
    return [
      {
        userRewardId,
        templateId,
        title: typeof title === 'string' ? title : '獎勵',
        description:
          typeof row.description === 'string' ? row.description : null,
        type: typeof row.type === 'string' ? row.type : 'points',
        rewardValue: row.reward_value ?? null,
        pointsGranted:
          typeof row.points_granted === 'number'
            ? row.points_granted
            : row.points_granted === null
              ? null
              : Number(row.points_granted ?? NaN) || null,
      },
    ];
  });
}

function resolveGrantPoints(grant: UnacknowledgedRewardGrant): number {
  return (
    grant.pointsGranted ??
    (typeof grant.rewardValue === 'object' &&
    grant.rewardValue !== null &&
    'points' in grant.rewardValue
      ? Number((grant.rewardValue as PointsRewardValue).points)
      : 0)
  );
}

/** Stub value for CouponTicketShell left panel (aligned with wallet coupon tickets). */
export function formatRewardGrantValueLabel(
  grant: UnacknowledgedRewardGrant,
): string {
  if (grant.type === 'points') {
    return `+${resolveGrantPoints(grant).toLocaleString()}`;
  }
  if (grant.type === 'discount_coupon') {
    const v = grant.rewardValue as DiscountCouponRewardValue | null;
    if (v?.amount_hkd != null) {
      return `HK$ ${v.amount_hkd.toLocaleString('en-HK')}`;
    }
    if (v?.percent_off != null) {
      return `${v.percent_off}% OFF`;
    }
    return '折扣券';
  }
  if (grant.type === 'free_shipping') {
    return '免運費';
  }
  if (grant.type === 'lucky_draw_ticket') {
    return '抽獎券';
  }
  return '獎勵';
}

export function formatRewardGrantSummary(grant: UnacknowledgedRewardGrant): string {
  if (grant.type === 'points') {
    return `+${resolveGrantPoints(grant).toLocaleString()} PTS`;
  }
  if (grant.type === 'discount_coupon') {
    const v = grant.rewardValue as DiscountCouponRewardValue | null;
    if (v?.amount_hkd) return `HK$${v.amount_hkd} 折扣券`;
    if (v?.percent_off) return `${v.percent_off}% 折扣券`;
    return REWARD_TYPE_LABELS.discount_coupon;
  }
  if (grant.type === 'lucky_draw_ticket') {
    const v = grant.rewardValue as LuckyDrawTicketRewardValue | null;
    return v?.draw_name_zh ?? REWARD_TYPE_LABELS.lucky_draw_ticket;
  }
  return REWARD_TYPE_LABELS[grant.type] ?? '專屬獎勵';
}
