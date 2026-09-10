import { describe, expect, it } from "vitest";
import {
  PHASE9A_EVENT_IDS,
  PHASE9A_PUSH_CATALOG,
  PHASE9A_TEMPLATE_KEYS,
} from "@/lib/notifications/push-phase9a-registry";
import {
  buildOrderBuyerConfirmedSellerPushCopy,
  buildOrderCompletedBuyerPushCopy,
  buildOrderCompletedMerchantPushCopy,
  buildOrderConfirmReminderBuyerPushCopy,
  buildOrderReviewInvitePushCopy,
  buildOrderShipReminderSellerPushCopy,
} from "@/lib/notifications/order-push";

describe("Phase 9a push gate (order lifecycle + reminders)", () => {
  it("catalog has unique event ids and template keys", () => {
    expect(PHASE9A_PUSH_CATALOG.length).toBe(5);
    expect(new Set(PHASE9A_EVENT_IDS).size).toBe(PHASE9A_EVENT_IDS.length);
    expect(new Set(PHASE9A_TEMPLATE_KEYS).size).toBe(
      PHASE9A_TEMPLATE_KEYS.length,
    );
  });

  it("renders P-ORD-04 copy", () => {
    const copy = buildOrderBuyerConfirmedSellerPushCopy({
      cardName: "皮卡丘 VMAX",
      buyerName: "Ash",
    });
    expect(copy.heading).toBe("買家已確認收貨：皮卡丘 VMAX");
    expect(copy.body).toContain("Ash");
  });

  it("renders P-ORD-05 buyer copy", () => {
    const copy = buildOrderCompletedBuyerPushCopy({ cardName: "皮卡丘 VMAX" });
    expect(copy.heading).toBe("訂單已完成：皮卡丘 VMAX");
    expect(copy.body).toContain("感謝您的交易");
  });

  it("renders P-ORD-05 merchant copy", () => {
    const copy = buildOrderCompletedMerchantPushCopy({
      cardName: "皮卡丘 VMAX",
    });
    expect(copy.heading).toBe("訂單完成：皮卡丘 VMAX");
    expect(copy.body).toContain("撥款");
  });

  it("renders P-ORD-06 copy", () => {
    const copy = buildOrderConfirmReminderBuyerPushCopy({
      cardName: "皮卡丘 VMAX",
    });
    expect(copy.heading).toBe("提醒：請確認收貨");
    expect(copy.body).toContain("皮卡丘 VMAX");
  });

  it("renders P-ORD-07 copy", () => {
    const copy = buildOrderShipReminderSellerPushCopy({
      cardName: "皮卡丘 VMAX",
    });
    expect(copy.heading).toBe("提醒：待發貨");
    expect(copy.body).toContain("已付款");
  });

  it("renders P-ORD-08 copy", () => {
    const copy = buildOrderReviewInvitePushCopy({ cardName: "皮卡丘 VMAX" });
    expect(copy.heading).toBe("為這次交易評分");
    expect(copy.body).toContain("評價");
  });
});
