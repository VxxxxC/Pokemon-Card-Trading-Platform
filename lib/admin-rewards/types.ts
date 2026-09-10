import type { Database } from "@/types/supabase";

export type AdminRewardTemplateStatus =
  Database["public"]["Enums"]["reward_template_status"];

export type AdminRewardDistributionMode =
  Database["public"]["Enums"]["reward_distribution_mode"];

export type AdminRewardTemplateType = Exclude<
  Database["public"]["Enums"]["reward_type"],
  "lucky_draw_ticket"
>;

export type AdminRewardTriggerKind =
  | "none"
  | "event_once"
  | "trade_count"
  | "check_in_streak"
  | "check_in_cycle_day";

export type AdminRewardEventOnceEvent =
  | "profile_complete"
  | "first_listing"
  | "first_chat"
  | "account_registered";

export type AdminRewardAuthRestriction = "any" | "true" | "false";

export type AdminRewardTemplateRestrictions = {
  order_kinds: ("merchant" | "member")[];
  requires_authentication: AdminRewardAuthRestriction;
  shipping_methods: ("sf" | "meetup")[];
  min_item_subtotal_hkd: number;
};

export type AdminRewardTemplateRow = {
  id: string;
  title: string;
  description: string | null;
  type: AdminRewardTemplateType;
  reward_value: Record<string, unknown>;
  trigger_conditions: Record<string, unknown>;
  is_active: boolean | null;
  is_infinite: boolean | null;
  max_claims: number | null;
  claimed_count: number;
  valid_duration_days: number | null;
  fixed_expiry_date: string | null;
  status: AdminRewardTemplateStatus;
  distribution_mode: AdminRewardDistributionMode;
  restrictions: AdminRewardTemplateRestrictions;
  created_at: string | null;
  updated_at: string | null;
};

export type AdminRewardTemplateFlashSchedule = {
  campaign_id?: string;
  campaign_name: string;
  starts_at: string;
  ends_at: string;
  max_claims: number;
  max_claims_per_user: number;
  override_valid_days: number | null;
};

export type AdminRewardTemplateUpsertInput = {
  id?: string;
  title: string;
  description?: string | null;
  type: AdminRewardTemplateType;
  reward_value: Record<string, unknown>;
  trigger_conditions: Record<string, unknown>;
  is_infinite: boolean;
  max_claims?: number | null;
  valid_duration_days?: number | null;
  fixed_expiry_date?: string | null;
  distribution_mode?: AdminRewardDistributionMode;
  restrictions?: AdminRewardTemplateRestrictions;
  flash_schedule?: AdminRewardTemplateFlashSchedule;
};

export const DEFAULT_ADMIN_REWARD_RESTRICTIONS: AdminRewardTemplateRestrictions =
  {
    order_kinds: ["merchant"],
    requires_authentication: "any",
    shipping_methods: ["sf"],
    min_item_subtotal_hkd: 0,
  };

export type AdminRewardCampaignStatus =
  | "draft"
  | "active"
  | "paused"
  | "ended";

export type AdminRewardCampaignRow = {
  id: string;
  template_id: string;
  name: string;
  status: AdminRewardCampaignStatus;
  starts_at: string;
  ends_at: string;
  max_claims: number;
  claimed_count: number;
  max_claims_per_user: number;
  override_valid_days: number | null;
  created_by: string | null;
  created_at: string | null;
  updated_at: string | null;
  template_title: string | null;
  template_type: string | null;
};

export type AdminRewardCampaignUpsertInput = {
  id?: string;
  template_id: string;
  name: string;
  status?: AdminRewardCampaignStatus;
  starts_at: string;
  ends_at: string;
  max_claims: number;
  max_claims_per_user?: number;
  override_valid_days?: number | null;
};

export type FlashCampaignTemplateView = {
  id: string;
  title: string;
  description: string | null;
  type: string;
  reward_value: Record<string, unknown>;
};

export type FlashCampaignView = {
  id: string;
  name: string;
  starts_at: string;
  ends_at: string;
  max_claims: number;
  claimed_count: number;
  max_claims_per_user: number;
  remaining_claims: number;
  user_claims_today: number;
  can_claim: boolean;
  template: FlashCampaignTemplateView;
};

export type AdminRedemptionCatalogInput = {
  enabled: boolean;
  points_cost: number;
  stock: number;
  is_active: boolean;
  display_order?: number;
  /** Lifetime per-user cap; null/undefined = unlimited */
  max_redemptions_per_user?: number | null;
};

export type AdminRewardActivitySchedule = {
  campaign_id?: string;
  name?: string;
  campaign_name?: string;
  starts_at: string;
  ends_at: string;
  max_claims: number;
  max_claims_per_user: number;
  override_valid_days: number | null;
  status?: AdminRewardCampaignStatus;
};

export type AdminRewardActivityUpsertInput = AdminRewardTemplateUpsertInput & {
  schedule?: AdminRewardActivitySchedule;
  redemption_catalog?: AdminRedemptionCatalogInput;
};

export type AdminRewardActivityRow = AdminRewardTemplateRow & {
  activity_id: string;
  campaign_id: string | null;
  campaign_name: string | null;
  campaign_status: AdminRewardCampaignStatus | null;
  starts_at: string | null;
  ends_at: string | null;
  campaign_max_claims: number | null;
  campaign_claimed_count: number | null;
  max_claims_per_user: number | null;
  override_valid_days: number | null;
  display_status: string;
  redemption_catalog?: AdminRedemptionCatalogInput | null;
};

export type PointsRedemptionCatalogView = {
  catalogId: string;
  pointsCost: number;
  stock: number;
  userRedemptionCount: number;
  maxRedemptionsPerUser: number | null;
  canRedeem: boolean;
  userPointsBalance: number;
  template: {
    id: string;
    title: string;
    description: string | null;
    type: string;
    rewardValue: Record<string, unknown>;
    restrictions: Record<string, unknown>;
  };
};

export type AdminRewardActivityStatus =
  | AdminRewardTemplateStatus
  | AdminRewardCampaignStatus;
