import { describe, expect, it } from "bun:test";
import {
  isMerchantOrderBuyerConfirmed,
  isMerchantOrderPayoutHeld,
  shouldShowMerchantBuyerPayoutStatus,
} from "./display-status";

describe("isMerchantOrderBuyerConfirmed", () => {
  it("returns true when buyerConfirmedAt is set", () => {
    expect(
      isMerchantOrderBuyerConfirmed({
        buyerConfirmedAt: "2026-08-04T10:19:13.543+00:00",
      }),
    ).toBe(true);
  });

  it("returns false when buyerConfirmedAt is empty", () => {
    expect(isMerchantOrderBuyerConfirmed({ buyerConfirmedAt: null })).toBe(
      false,
    );
    expect(isMerchantOrderBuyerConfirmed({ buyerConfirmedAt: "" })).toBe(
      false,
    );
  });
});

describe("isMerchantOrderPayoutHeld", () => {
  it("recognizes held and processing", () => {
    expect(isMerchantOrderPayoutHeld("held")).toBe(true);
    expect(isMerchantOrderPayoutHeld("processing")).toBe(true);
  });

  it("returns false for other statuses", () => {
    expect(isMerchantOrderPayoutHeld("paid")).toBe(false);
    expect(isMerchantOrderPayoutHeld(null)).toBe(false);
  });
});

describe("shouldShowMerchantBuyerPayoutStatus", () => {
  it("hides pending and checkout-phase orders", () => {
    expect(shouldShowMerchantBuyerPayoutStatus("pending", false)).toBe(false);
    expect(shouldShowMerchantBuyerPayoutStatus("held", true)).toBe(false);
    expect(shouldShowMerchantBuyerPayoutStatus(null, false)).toBe(false);
  });

  it("shows post-confirm and terminal payout states", () => {
    expect(shouldShowMerchantBuyerPayoutStatus("held", false)).toBe(true);
    expect(shouldShowMerchantBuyerPayoutStatus("processing", false)).toBe(true);
    expect(shouldShowMerchantBuyerPayoutStatus("paid", false)).toBe(true);
    expect(shouldShowMerchantBuyerPayoutStatus("failed", false)).toBe(true);
    expect(shouldShowMerchantBuyerPayoutStatus("frozen", false)).toBe(true);
  });
});
