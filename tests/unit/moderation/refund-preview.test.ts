import { describe, expect, it } from "vitest";
import { computeModerationRefundBreakdownPreview } from "@/lib/moderation/refund-breakdown-preview";

/** refund-policy §8.2 fixture: A=800, C=50, D=150, T=1000, stripe_fee=30 */
const POLICY_ELIGIBLE = 850;
const POLICY_PLATFORM = 1000;
const AUTH_FEE = 150;
const ESTIMATE_FEE = 30;

describe("computeModerationRefundBreakdownPreview (§8.2 member_auth)", () => {
  it("seller fault", () => {
    const preview = computeModerationRefundBreakdownPreview({
      orderKind: "member_auth",
      policyHkd: POLICY_ELIGIBLE,
      authFeeHkd: AUTH_FEE,
      faultParty: "seller",
      feeRecoveryMode: "full",
      policyEstimateStripeFeeHkd: ESTIMATE_FEE,
    });

    expect(preview.eligiblePolicyHkd).toBe(850);
    expect(preview.stripeFeeHkd).toBeNull();
    expect(preview.refundToBuyerHkd).toBe(850);
    expect(preview.authFeeRetainedHkd).toBe(150);
    expect(preview.sellerRecoveryHkd).toBe(880);
    expect(preview.platformAbsorbHkd).toBe(0);
  });

  it("buyer fault", () => {
    const preview = computeModerationRefundBreakdownPreview({
      orderKind: "member_auth",
      policyHkd: POLICY_ELIGIBLE,
      authFeeHkd: AUTH_FEE,
      faultParty: "buyer",
      feeRecoveryMode: "none",
      policyEstimateStripeFeeHkd: ESTIMATE_FEE,
    });

    expect(preview.refundToBuyerHkd).toBe(820);
    expect(preview.sellerRecoveryHkd).toBe(0);
    expect(preview.authFeeRetainedHkd).toBe(150);
  });

  it("platform fault with reason", () => {
    const preview = computeModerationRefundBreakdownPreview({
      orderKind: "member_auth",
      policyHkd: POLICY_PLATFORM,
      authFeeHkd: AUTH_FEE,
      faultParty: "platform",
      platformFaultReason: "ops error",
      feeRecoveryMode: "none",
      policyEstimateStripeFeeHkd: ESTIMATE_FEE,
    });

    expect(preview.eligiblePolicyHkd).toBe(1000);
    expect(preview.refundToBuyerHkd).toBe(1000);
    expect(preview.authFeeRetainedHkd).toBe(0);
    expect(preview.sellerRecoveryHkd).toBe(0);
    expect(preview.platformAbsorbHkd).toBe(30);
  });

  it("carrier (seller logistics)", () => {
    const preview = computeModerationRefundBreakdownPreview({
      orderKind: "member_auth",
      policyHkd: POLICY_ELIGIBLE,
      authFeeHkd: AUTH_FEE,
      faultParty: "carrier",
      feeRecoveryMode: "full",
      policyEstimateStripeFeeHkd: ESTIMATE_FEE,
    });

    expect(preview.refundToBuyerHkd).toBe(850);
    expect(preview.sellerRecoveryHkd).toBe(880);
    expect(preview.authFeeRetainedHkd).toBe(150);
  });

  it("inconclusive (fee_half)", () => {
    const preview = computeModerationRefundBreakdownPreview({
      orderKind: "member_auth",
      policyHkd: POLICY_ELIGIBLE,
      authFeeHkd: AUTH_FEE,
      faultParty: "inconclusive",
      feeRecoveryMode: "fee_half",
      policyEstimateStripeFeeHkd: ESTIMATE_FEE,
    });

    expect(preview.refundToBuyerHkd).toBe(850);
    expect(preview.sellerRecoveryHkd).toBe(15);
    expect(preview.platformAbsorbHkd).toBe(15);
    expect(preview.authFeeRetainedHkd).toBe(150);
  });
});
