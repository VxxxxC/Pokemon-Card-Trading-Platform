import { describe, expect, test } from "bun:test";
import {
  getAuthEscrowStepIndexFromStatus,
  getMemberAuthEscrowTimelineSteps,
  getMemberAuthSellerReleasedStepCopy,
  isMemberAuthSellerPayoutComplete,
  MEMBER_AUTH_ESCROW_SELLER_STEPS,
} from "@/app/lib/member-order/auth-escrow";

describe("member auth escrow seller timeline copy", () => {
  test("released step uses FPS payout wording, not Stripe Connect", () => {
    const releasedStep = MEMBER_AUTH_ESCROW_SELLER_STEPS.find(
      (step) => step.id === "released",
    );

    expect(releasedStep).toBeDefined();
    expect(releasedStep?.description).not.toContain("Stripe Connect");
    expect(releasedStep?.description).toContain("轉數快");
  });

  test("sell perspective timeline exposes FPS payout copy on released step", () => {
    const steps = getMemberAuthEscrowTimelineSteps("sell");
    const releasedStep = steps.find((step) => step.id === "released");

    expect(releasedStep?.label).toBe("訂單完成，即將撥款");
    expect(releasedStep?.description).toBe(
      "交易完成，平台將透過轉數快撥款至你的收款帳戶",
    );
  });
});

describe("getAuthEscrowStepIndexFromStatus", () => {
  test("marks all steps complete for buyer when order is completed", () => {
    expect(
      getAuthEscrowStepIndexFromStatus("released", "completed", {
        perspective: "buy",
      }),
    ).toBe(5);
  });

  test("keeps last step active for seller until FPS payout is paid", () => {
    expect(
      getAuthEscrowStepIndexFromStatus("released", "completed", {
        perspective: "sell",
        sellerPayoutStatus: "ready",
      }),
    ).toBe(4);
  });

  test("marks all steps complete for seller after FPS payout is paid", () => {
    expect(
      getAuthEscrowStepIndexFromStatus("released", "completed", {
        perspective: "sell",
        sellerPayoutStatus: "paid",
      }),
    ).toBe(5);
  });

  test("marks all steps complete when fps payout request is completed", () => {
    expect(
      getAuthEscrowStepIndexFromStatus("released", "completed", {
        perspective: "sell",
        sellerPayoutStatus: "ready",
        fpsPayoutRequestStatus: "completed",
      }),
    ).toBe(5);
  });
});

describe("getMemberAuthSellerReleasedStepCopy", () => {
  test("uses pending copy before payout completes", () => {
    expect(getMemberAuthSellerReleasedStepCopy(false)).toEqual({
      label: "訂單完成，即將撥款",
      description: "交易完成，平台將透過轉數快撥款至你的收款帳戶",
    });
  });

  test("uses paid copy after payout completes", () => {
    expect(getMemberAuthSellerReleasedStepCopy(true)).toEqual({
      label: "已撥款",
      description: "款項已透過轉數快撥至你的收款帳戶",
    });
  });
});

describe("isMemberAuthSellerPayoutComplete", () => {
  test("accepts seller payout paid or fps request completed", () => {
    expect(isMemberAuthSellerPayoutComplete("paid", null)).toBe(true);
    expect(isMemberAuthSellerPayoutComplete("ready", "completed")).toBe(true);
    expect(isMemberAuthSellerPayoutComplete("ready", "processing")).toBe(false);
  });
});
