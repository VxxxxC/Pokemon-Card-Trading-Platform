import type {
  ModerationResolution,
  ResolveAdminModerationCaseInput,
  SanctionScope,
  SanctionType,
} from "@/lib/moderation/types";

export type ModerationResolutionOptionValue =
  | "dismissed"
  | "insufficient_evidence"
  | "upheld_warn_only"
  | "suspend_7d"
  | "ban_permanent"
  | "restrict_member_listing"
  | "restrict_merchant_listing"
  | "freeze_payout";

export type ModerationResolutionOption = {
  value: ModerationResolutionOptionValue;
  label: string;
  requiresUpheld: boolean;
  disabledWhenEvidenceInsufficient: boolean;
};

export const MODERATION_RESOLUTION_OPTIONS: ModerationResolutionOption[] = [
  {
    value: "dismissed",
    label: "駁回舉報",
    requiresUpheld: false,
    disabledWhenEvidenceInsufficient: false,
  },
  {
    value: "insufficient_evidence",
    label: "證據不足",
    requiresUpheld: false,
    disabledWhenEvidenceInsufficient: false,
  },
  {
    value: "upheld_warn_only",
    label: "裁定成立（僅警告／可選退款）",
    requiresUpheld: true,
    disabledWhenEvidenceInsufficient: true,
  },
  {
    value: "suspend_7d",
    label: "凍結帳戶 7 日",
    requiresUpheld: true,
    disabledWhenEvidenceInsufficient: true,
  },
  {
    value: "ban_permanent",
    label: "永久封禁",
    requiresUpheld: true,
    disabledWhenEvidenceInsufficient: true,
  },
  {
    value: "restrict_member_listing",
    label: "限制 Member 上架",
    requiresUpheld: true,
    disabledWhenEvidenceInsufficient: true,
  },
  {
    value: "restrict_merchant_listing",
    label: "限制 Merchant 店鋪上架",
    requiresUpheld: true,
    disabledWhenEvidenceInsufficient: true,
  },
  {
    value: "freeze_payout",
    label: "凍結出款",
    requiresUpheld: true,
    disabledWhenEvidenceInsufficient: true,
  },
];

export const VIOLATION_PERSONA_OPTIONS: Array<{
  value: NonNullable<ResolveAdminModerationCaseInput["violationPersona"]>;
  label: string;
}> = [
  { value: "member", label: "Member" },
  { value: "merchant", label: "Merchant" },
  { value: "both", label: "兩者" },
  { value: "unknown", label: "未知" },
];

function suspendEndsAtIso(days: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString();
}

export function mapResolutionOptionToInput(
  optionValue: ModerationResolutionOptionValue,
  violationPersona?: ResolveAdminModerationCaseInput["violationPersona"],
): ResolveAdminModerationCaseInput {
  switch (optionValue) {
    case "dismissed":
      return { resolution: "dismissed" };
    case "insufficient_evidence":
      return { resolution: "insufficient_evidence" };
    case "upheld_warn_only":
      return {
        resolution: "upheld",
        violationPersona,
      };
    case "suspend_7d":
      return {
        resolution: "upheld",
        violationPersona,
        sanction: {
          scope: "account",
          type: "suspend",
          endsAt: suspendEndsAtIso(7),
          reason: "管理員裁定：帳戶暫停 7 日",
        },
      };
    case "ban_permanent":
      return {
        resolution: "upheld",
        violationPersona,
        sanction: {
          scope: "account",
          type: "ban",
          endsAt: null,
          reason: "管理員裁定：永久封禁",
        },
      };
    case "restrict_member_listing":
      return {
        resolution: "upheld",
        violationPersona,
        sanction: {
          scope: "member_persona",
          type: "restrict_listing",
          endsAt: null,
          reason: "管理員裁定：限制 Member 上架",
        },
      };
    case "restrict_merchant_listing":
      return {
        resolution: "upheld",
        violationPersona,
        sanction: {
          scope: "merchant_persona",
          type: "restrict_listing",
          endsAt: null,
          reason: "管理員裁定：限制 Merchant 上架",
        },
      };
    case "freeze_payout":
      return {
        resolution: "upheld",
        violationPersona,
        sanction: {
          scope: "account",
          type: "freeze_payout",
          endsAt: null,
          reason: "管理員裁定：凍結出款",
        },
      };
    default: {
      const _exhaustive: never = optionValue;
      return _exhaustive;
    }
  }
}

export function isUpheldResolutionOption(
  value: ModerationResolutionOptionValue,
): boolean {
  return MODERATION_RESOLUTION_OPTIONS.find((opt) => opt.value === value)
    ?.requiresUpheld ?? false;
}

export type { ModerationResolution, SanctionScope, SanctionType };
