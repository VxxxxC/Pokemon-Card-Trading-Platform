import { describe, expect, it } from "vitest";
import {
  PHASE2_EVENT_IDS,
  PHASE2_PUSH_CATALOG,
  PHASE2_TEMPLATE_KEYS,
} from "@/lib/notifications/push-phase2-registry";
import {
  buildBuyNowSellerPushCopy,
  buildOfferAcceptedPushCopy,
  buildOfferReceivedPushCopy,
  buildOfferRejectedPushCopy,
  formatOfferPushPrice,
} from "@/lib/notifications/offer-push";

describe("Phase 2 push gate (offers)", () => {
  it("catalog has unique event ids and template keys", () => {
    expect(PHASE2_PUSH_CATALOG.length).toBe(4);
    expect(new Set(PHASE2_EVENT_IDS).size).toBe(PHASE2_EVENT_IDS.length);
    expect(new Set(PHASE2_TEMPLATE_KEYS).size).toBe(PHASE2_TEMPLATE_KEYS.length);
  });

  it("renders P-OFF-01 copy", () => {
    const copy = buildOfferReceivedPushCopy({
      cardName: "皮卡丘 VMAX",
      buyerName: "Ash",
      offerPrice: 1200,
    });
    expect(copy.heading).toBe("收到新出價");
    expect(copy.body).toContain("Ash");
    expect(copy.body).toContain(formatOfferPushPrice(1200));
  });

  it("renders P-OFF-02 copy", () => {
    const copy = buildOfferAcceptedPushCopy({
      cardName: "皮卡丘 VMAX",
      sellerName: "Misty",
      offerPrice: 1200,
    });
    expect(copy.heading).toBe("出價已被接受");
    expect(copy.body).toContain("Misty");
  });

  it("renders P-OFF-03 copy", () => {
    const copy = buildOfferRejectedPushCopy({
      cardName: "皮卡丘 VMAX",
      sellerName: "Misty",
      offerPrice: 1200,
    });
    expect(copy.heading).toBe("出價已被拒絕");
  });

  it("renders P-OFF-04 copy", () => {
    const copy = buildBuyNowSellerPushCopy({
      cardName: "皮卡丘 VMAX",
      buyerName: "Ash",
      offerPrice: 1500,
    });
    expect(copy.heading).toBe("買家立即購買");
    expect(copy.body).toContain("Ash");
  });
});
