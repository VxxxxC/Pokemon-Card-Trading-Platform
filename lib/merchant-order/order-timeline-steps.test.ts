import { describe, expect, it } from "bun:test";
import {
  getMerchantAuthSellerTimelineStepIndex,
  getMerchantAuthSellerTimelineSteps,
} from "./order-timeline-steps";

describe("getMerchantAuthSellerTimelineStepIndex", () => {
  it("returns hold step when authenticated with payout held", () => {
    expect(
      getMerchantAuthSellerTimelineStepIndex("authenticated", "held"),
    ).toBe(5);
  });

  it("returns past final step when transferred and payout paid", () => {
    expect(
      getMerchantAuthSellerTimelineStepIndex(
        "completed_and_transferred",
        "paid",
      ),
    ).toBe(5);
  });

  it("returns authenticated step before buyer confirm", () => {
    expect(getMerchantAuthSellerTimelineStepIndex("authenticated", null)).toBe(
      3,
    );
  });
});

describe("getMerchantAuthSellerTimelineSteps", () => {
  it("inserts buyer confirm and hold steps when payout held", () => {
    const steps = getMerchantAuthSellerTimelineSteps("held");
    expect(steps.map((step) => step.id)).toEqual([
      "pending_payment",
      "payment_held",
      "authenticating",
      "authenticated",
      "buyer_confirmed",
      "hold",
      "completed",
    ]);
  });
});
