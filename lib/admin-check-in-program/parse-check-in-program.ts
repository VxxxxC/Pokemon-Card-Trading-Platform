import { rewardValueForType } from "@/lib/admin-rewards/template-form";
import type { AdminRewardTemplateType } from "@/lib/admin-rewards/types";
import {
  CHECK_IN_PROGRAM_ID,
  DEFAULT_DAILY_REWARDS,
  type CheckInCompletionType,
  type CheckInProgramMemberView,
  type CheckInProgramRow,
  type CheckInProgramUpsertInput,
} from "@/lib/admin-check-in-program/types";

function parseDailyRewards(raw: unknown): Record<string, number> {
  if (!raw || typeof raw !== "object") {
    return { ...DEFAULT_DAILY_REWARDS };
  }

  const result: Record<string, number> = {};
  for (let day = 1; day <= 7; day += 1) {
    const key = String(day);
    const value = (raw as Record<string, unknown>)[key];
    const points = Number(value);
    result[key] = Number.isFinite(points) && points > 0 ? points : DEFAULT_DAILY_REWARDS[key];
  }
  return result;
}

function parseCompletionType(value: unknown): CheckInCompletionType {
  if (value === "points" || value === "discount_coupon" || value === "free_shipping") {
    return value;
  }
  return "points";
}

export function parseCheckInProgramRow(raw: unknown): CheckInProgramRow | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  if (row.id !== CHECK_IN_PROGRAM_ID) return null;

  return {
    id: CHECK_IN_PROGRAM_ID,
    is_active: row.is_active === true,
    cycle_length_days: Number(row.cycle_length_days ?? 7),
    daily_rewards: parseDailyRewards(row.daily_rewards),
    completion_enabled: row.completion_enabled === true,
    completion_type: parseCompletionType(row.completion_type),
    completion_reward_value:
      row.completion_reward_value && typeof row.completion_reward_value === "object"
        ? (row.completion_reward_value as Record<string, unknown>)
        : { points: 50 },
    completion_title:
      typeof row.completion_title === "string" ? row.completion_title : "簽滿 7 日加碼",
    completion_description:
      typeof row.completion_description === "string" ? row.completion_description : null,
    completion_valid_duration_days:
      row.completion_valid_duration_days === null ||
      row.completion_valid_duration_days === undefined
        ? null
        : Number(row.completion_valid_duration_days),
    completion_type_locked: row.completion_type_locked === true,
    updated_at: typeof row.updated_at === "string" ? row.updated_at : null,
    updated_by: typeof row.updated_by === "string" ? row.updated_by : null,
  };
}

export function parseCheckInProgramMemberView(raw: unknown): CheckInProgramMemberView {
  if (!raw || typeof raw !== "object") {
    return {
      isActive: true,
      cycleLengthDays: 7,
      dailyRewards: Object.fromEntries(
        Object.entries(DEFAULT_DAILY_REWARDS).map(([k, v]) => [Number(k), v]),
      ),
      completionPreview: null,
    };
  }

  const payload = raw as Record<string, unknown>;
  const daily = parseDailyRewards(payload.daily_rewards);
  const dailyNumeric: Record<number, number> = {};
  for (const [key, value] of Object.entries(daily)) {
    dailyNumeric[Number(key)] = value;
  }

  let completionPreview: CheckInProgramMemberView["completionPreview"] = null;
  const preview = payload.completion_preview;
  if (preview && typeof preview === "object") {
    const p = preview as Record<string, unknown>;
    if (p.enabled === true) {
      completionPreview = {
        enabled: true,
        type: parseCompletionType(p.type),
        title: typeof p.title === "string" ? p.title : undefined,
        description: typeof p.description === "string" ? p.description : null,
        rewardValue:
          p.reward_value && typeof p.reward_value === "object"
            ? (p.reward_value as Record<string, unknown>)
            : undefined,
      };
    } else {
      completionPreview = { enabled: false };
    }
  }

  return {
    isActive: payload.is_active !== false,
    cycleLengthDays: Number(payload.cycle_length_days ?? 7),
    dailyRewards: dailyNumeric,
    completionPreview,
  };
}

export function programRowToForm(row: CheckInProgramRow): CheckInProgramUpsertInput {
  return {
    is_active: row.is_active,
    daily_rewards: { ...row.daily_rewards },
    completion_enabled: row.completion_enabled,
    completion_type: row.completion_type,
    completion_reward_value: { ...row.completion_reward_value },
    completion_title: row.completion_title,
    completion_description: row.completion_description,
    completion_valid_duration_days: row.completion_valid_duration_days,
  };
}

export function buildDefaultCheckInProgramForm(): CheckInProgramUpsertInput {
  return {
    is_active: true,
    daily_rewards: { ...DEFAULT_DAILY_REWARDS },
    completion_enabled: true,
    completion_type: "points",
    completion_reward_value: { points: 50 },
    completion_title: "簽滿 7 日加碼",
    completion_description: "連續簽到週期第 7 日額外積分獎勵",
    completion_valid_duration_days: null,
  };
}

export function completionRewardValueForType(
  type: CheckInCompletionType,
): Record<string, unknown> {
  return rewardValueForType(type as AdminRewardTemplateType);
}

export function upsertInputToRpcPayload(
  input: CheckInProgramUpsertInput,
): Record<string, unknown> {
  return {
    is_active: input.is_active,
    daily_rewards: input.daily_rewards,
    completion_enabled: input.completion_enabled,
    completion_type: input.completion_type,
    completion_reward_value: input.completion_reward_value,
    completion_title: input.completion_title,
    completion_description: input.completion_description ?? null,
    completion_valid_duration_days: input.completion_valid_duration_days ?? null,
  };
}

export function parseCompletionGranted(raw: unknown): {
  type: string;
  title: string;
  pointsGranted: number | null;
} | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  return {
    type: typeof row.type === "string" ? row.type : "points",
    title: typeof row.title === "string" ? row.title : "獎勵",
    pointsGranted:
      row.points_granted === null || row.points_granted === undefined
        ? null
        : Number(row.points_granted),
  };
}
