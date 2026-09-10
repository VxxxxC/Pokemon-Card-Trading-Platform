import type { GradingFaultParty } from "@/lib/payments/auth-grading-fail-void-saga";
import type { FeeRecoveryMode, ModerationOrderKind } from "@/lib/payments/moderation-order-refund-saga";

export const MODERATION_REFUND_PREVIEW_STRIPE_FEE_NOTE =
  "finalize 時從 Stripe 讀取";

export type ModerationRefundBreakdownPreview = {
  eligiblePolicyHkd: number;
  stripeFeeHkd: null;
  stripeFeeNote: string;
  refundToBuyerHkd: number;
  authFeeRetainedHkd: number;
  sellerRecoveryHkd: number;
  platformAbsorbHkd: number;
  orderKind: ModerationOrderKind;
  faultParty: GradingFaultParty;
};

export type ComputeModerationRefundBreakdownInput = {
  orderKind: ModerationOrderKind;
  policyHkd: number;
  authFeeHkd: number;
  faultParty: GradingFaultParty;
  platformFaultReason?: string | null;
  feeRecoveryMode: FeeRecoveryMode;
  policyEstimateStripeFeeHkd: number;
};

function roundHkd(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Policy estimate for preview math (IC-3); stripeFeeHkd output stays null. */
export function estimateModerationRefundStripeFeeHkd(buyerTotalHkd: number): number {
  if (buyerTotalHkd <= 0) {
    return 0;
  }
  return roundHkd(Math.max(buyerTotalHkd * 0.03, 2.35));
}

export function computeModerationRefundBreakdownPreview(
  input: ComputeModerationRefundBreakdownInput,
): ModerationRefundBreakdownPreview {
  const eligiblePolicyHkd = roundHkd(input.policyHkd);
  const estimateFee = roundHkd(Math.max(input.policyEstimateStripeFeeHkd, 0));
  const hasAuthFee =
    input.orderKind === "member_auth" || input.orderKind === "merchant_auth";
  const platformFaultWithReason =
    input.faultParty === "platform" &&
    Boolean(input.platformFaultReason?.trim());

  const authFeeRetainedHkd = hasAuthFee && !platformFaultWithReason
    ? roundHkd(input.authFeeHkd)
    : 0;

  const refundToBuyerHkd =
    input.faultParty === "buyer"
      ? roundHkd(Math.max(eligiblePolicyHkd - estimateFee, 0))
      : eligiblePolicyHkd;

  let sellerRecoveryHkd = 0;
  let platformAbsorbHkd = 0;

  if (input.feeRecoveryMode === "full") {
    sellerRecoveryHkd = roundHkd(eligiblePolicyHkd + estimateFee);
  } else if (input.feeRecoveryMode === "fee_half") {
    sellerRecoveryHkd = roundHkd(estimateFee / 2);
    platformAbsorbHkd = roundHkd(estimateFee / 2);
  } else if (input.faultParty === "platform") {
    platformAbsorbHkd = estimateFee;
  }

  return {
    eligiblePolicyHkd,
    stripeFeeHkd: null,
    stripeFeeNote: MODERATION_REFUND_PREVIEW_STRIPE_FEE_NOTE,
    refundToBuyerHkd,
    authFeeRetainedHkd,
    sellerRecoveryHkd,
    platformAbsorbHkd,
    orderKind: input.orderKind,
    faultParty: input.faultParty,
  };
}

function readNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export function parseModerationRefundBreakdownPreview(
  data: unknown,
): ModerationRefundBreakdownPreview | null {
  if (!data || typeof data !== "object") {
    return null;
  }

  const row = data as Record<string, unknown>;
  const orderKind = row.orderKind ?? row.order_kind;
  const faultParty = row.faultParty ?? row.fault_party;
  const eligiblePolicyHkd = readNumber(row.eligiblePolicyHkd ?? row.eligible_policy_hkd);
  const refundToBuyerHkd = readNumber(row.refundToBuyerHkd ?? row.refund_to_buyer_hkd);
  const authFeeRetainedHkd = readNumber(
    row.authFeeRetainedHkd ?? row.auth_fee_retained_hkd,
  );
  const sellerRecoveryHkd = readNumber(row.sellerRecoveryHkd ?? row.seller_recovery_hkd);
  const platformAbsorbHkd = readNumber(row.platformAbsorbHkd ?? row.platform_absorb_hkd);

  if (
    typeof orderKind !== "string" ||
    typeof faultParty !== "string" ||
    eligiblePolicyHkd === null ||
    refundToBuyerHkd === null ||
    authFeeRetainedHkd === null ||
    sellerRecoveryHkd === null ||
    platformAbsorbHkd === null
  ) {
    return null;
  }

  return {
    eligiblePolicyHkd,
    stripeFeeHkd: null,
    stripeFeeNote:
      typeof row.stripeFeeNote === "string"
        ? row.stripeFeeNote
        : typeof row.stripe_fee_note === "string"
          ? row.stripe_fee_note
          : MODERATION_REFUND_PREVIEW_STRIPE_FEE_NOTE,
    refundToBuyerHkd,
    authFeeRetainedHkd,
    sellerRecoveryHkd,
    platformAbsorbHkd,
    orderKind: orderKind as ModerationOrderKind,
    faultParty: faultParty as GradingFaultParty,
  };
}
