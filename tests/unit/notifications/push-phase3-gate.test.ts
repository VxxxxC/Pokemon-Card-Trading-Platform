import { describe, expect, it } from "vitest";
import {
  PHASE3_EVENT_IDS,
  PHASE3_PUSH_CATALOG,
  PHASE3_TEMPLATE_KEYS,
} from "@/lib/notifications/push-phase3-registry";
import {
  buildOrderPaymentConfirmedSellerPushCopy,
  buildOrderPaymentExpiredBuyerPushCopy,
  buildOrderShippedBuyerPushCopy,
  formatOrderPushAmount,
} from "@/lib/notifications/order-push";

describe("Phase 3 push gate (orders)", () => {
  it("catalog has unique event ids and template keys", () => {
    expect(PHASE3_PUSH_CATALOG.length).toBe(3);
    expect(new Set(PHASE3_EVENT_IDS).size).toBe(PHASE3_EVENT_IDS.length);
    expect(new Set(PHASE3_TEMPLATE_KEYS).size).toBe(PHASE3_TEMPLATE_KEYS.length);
  });

  it("renders P-ORD-01 copy", () => {
    const copy = buildOrderPaymentConfirmedSellerPushCopy({
      cardName: "皮卡丘 VMAX",
      buyerName: "Ash",
      amountLabel: formatOrderPushAmount(1200),
    });
    expect(copy.heading).toBe("買家已付款：皮卡丘 VMAX");
    expect(copy.body).toContain("Ash");
    expect(copy.body).toContain("HK$1,200");
  });

  it("renders P-ORD-02 copy", () => {
    const copy = buildOrderShippedBuyerPushCopy({
      cardName: "皮卡丘 VMAX",
      sellerName: "Card Vault",
      trackingNo: "SF123",
      courierName: "順豐",
    });
    expect(copy.heading).toBe("賣家已發貨：皮卡丘 VMAX");
    expect(copy.body).toContain("順豐 SF123");
  });

  it("renders P-ORD-03 copy", () => {
    const copy = buildOrderPaymentExpiredBuyerPushCopy({
      cardName: "皮卡丘 VMAX",
      amountLabel: formatOrderPushAmount(1200),
    });
    expect(copy.heading).toBe("訂單已取消：皮卡丘 VMAX");
    expect(copy.body).toContain("逾期未付款");
  });
});
