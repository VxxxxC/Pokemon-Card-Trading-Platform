import type { Database } from "@/types/supabase";

export type CheckInCompletionType = Extract<
  Database["public"]["Enums"]["reward_type"],
  "points" | "discount_coupon" | "free_shipping"
>;

export type CheckInProgramRow = {
  id: string;
  is_active: boolean;
  cycle_length_days: number;
  daily_rewards: Record<string, number>;
  completion_enabled: boolean;
  completion_type: CheckInCompletionType;
  completion_reward_value: Record<string, unknown>;
  completion_title: string;
  completion_description: string | null;
  completion_valid_duration_days: number | null;
  completion_type_locked: boolean;
  updated_at: string | null;
  updated_by: string | null;
};

export type CheckInProgramUpsertInput = {
  is_active: boolean;
  daily_rewards: Record<string, number>;
  completion_enabled: boolean;
  completion_type: CheckInCompletionType;
  completion_reward_value: Record<string, unknown>;
  completion_title: string;
  completion_description?: string | null;
  completion_valid_duration_days?: number | null;
};

export type CheckInProgramMemberView = {
  isActive: boolean;
  cycleLengthDays: number;
  dailyRewards: Record<number, number>;
  completionPreview: {
    enabled: boolean;
    type?: CheckInCompletionType;
    title?: string;
    description?: string | null;
    rewardValue?: Record<string, unknown>;
  } | null;
};

export type CheckInCompletionGranted = {
  type: string;
  title: string;
  pointsGranted: number | null;
};

export const CHECK_IN_PROGRAM_ID = "b1000001-0001-4001-8001-000000000001";

export const DEFAULT_DAILY_REWARDS: Record<string, number> = {
  "1": 10,
  "2": 15,
  "3": 20,
  "4": 25,
  "5": 30,
  "6": 40,
  "7": 100,
};
