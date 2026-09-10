import { describe, expect, it } from "vitest";
import { renderEmailTemplate } from "@/lib/notifications/email-templates";
import { EMAIL_COLORS } from "@/lib/email/design-tokens";

describe("renderEmailTemplate", () => {
  it("renders acc.password_changed with branded layout", () => {
    const result = renderEmailTemplate({
      templateKey: "acc.password_changed",
      payload: {
        logoUrl: "https://cardvaulthk.com/asset/logo.png",
      },
    });

    expect(result).not.toBeNull();
    expect(result?.subject).toBe("您的密碼已更新");
    expect(result?.html).toContain(EMAIL_COLORS.headerBg);
    expect(result?.text).toContain("Cardvault HK");
  });

  it("renders offer.received with CTA button", () => {
    const result = renderEmailTemplate({
      templateKey: "offer.received",
      payload: {
        cardName: "皮卡丘",
        buyerName: "買家A",
        offerPriceLabel: "HK$299",
        actionUrl: "https://cardvaulthk.com/profile/user/trading",
        logoUrl: "https://cardvaulthk.com/asset/logo.png",
      },
    });

    expect(result?.subject).toBe("新叫價通知：皮卡丘");
    expect(result?.html).toContain("查看議價");
    expect(result?.html).toContain("https://cardvaulthk.com/profile/user/trading");
  });

  it("renders order.payment_confirmed for buyer and seller", () => {
    const buyer = renderEmailTemplate({
      templateKey: "order.payment_confirmed",
      payload: {
        recipientRole: "buyer",
        cardName: "皮卡丘",
        amountLabel: "HK$500",
        counterpartyName: "商戶A",
        actionUrl: "https://cardvaulthk.com/profile/user/orderDetail/abc",
        logoUrl: "https://cardvaulthk.com/asset/logo.png",
      },
    });

    expect(buyer?.subject).toBe("付款成功：皮卡丘");
    expect(buyer?.html).toContain("查看訂單");

    const seller = renderEmailTemplate({
      templateKey: "order.payment_confirmed",
      payload: {
        recipientRole: "seller",
        cardName: "皮卡丘",
        amountLabel: "HK$500",
        counterpartyName: "買家A",
        actionUrl: "https://cardvaulthk.com/profile/merchant/orderDetail/abc",
      },
    });

    expect(seller?.subject).toBe("買家已付款：皮卡丘");
    expect(seller?.html).toContain("買家已付款");
  });

  it("renders order.payment_expired for buyer and seller", () => {
    const buyer = renderEmailTemplate({
      templateKey: "order.payment_expired",
      payload: {
        recipientRole: "buyer",
        cardName: "皮卡丘",
        amountLabel: "HK$500",
        actionUrl: "https://cardvaulthk.com/profile/user/trading",
      },
    });

    expect(buyer?.subject).toBe("訂單已取消：皮卡丘");
    expect(buyer?.html).toContain("逾期未付款");

    const seller = renderEmailTemplate({
      templateKey: "order.payment_expired",
      payload: {
        recipientRole: "seller",
        cardName: "皮卡丘",
        amountLabel: "HK$500",
        counterpartyName: "買家A",
        actionUrl: "https://cardvaulthk.com/profile/merchant/orderDetail/abc",
      },
    });

    expect(seller?.subject).toBe("訂單已取消：皮卡丘");
    expect(seller?.html).toContain("買家逾期未付款");
  });

  it("renders order.shipped and order.buyer_confirmed", () => {
    const shipped = renderEmailTemplate({
      templateKey: "order.shipped",
      payload: {
        cardName: "皮卡丘",
        sellerName: "商戶A",
        trackingNo: "SF123",
        courierName: "順豐",
        actionUrl: "https://cardvaulthk.com/profile/user/orderDetail/abc",
      },
    });

    expect(shipped?.subject).toBe("賣家已發貨：皮卡丘");
    expect(shipped?.html).toContain("SF123");

    const confirmed = renderEmailTemplate({
      templateKey: "order.buyer_confirmed",
      payload: {
        cardName: "皮卡丘",
        buyerName: "買家A",
        actionUrl: "https://cardvaulthk.com/profile/merchant/orderDetail/abc",
      },
    });

    expect(confirmed?.subject).toBe("買家已確認收貨：皮卡丘");
    expect(confirmed?.html).toContain("買家已確認收貨");
  });

  it("renders offer.countered and order.cancelled", () => {
    const countered = renderEmailTemplate({
      templateKey: "offer.countered",
      payload: {
        cardName: "皮卡丘",
        buyerName: "買家A",
        offerPriceLabel: "HK$320",
        actionUrl: "https://cardvaulthk.com/profile/user/trading",
      },
    });

    expect(countered?.subject).toBe("出價已更新：皮卡丘");

    const cancelled = renderEmailTemplate({
      templateKey: "order.cancelled",
      payload: {
        recipientRole: "buyer",
        cardName: "皮卡丘",
        actionUrl: "https://cardvaulthk.com/profile/user/orderDetail/abc",
      },
    });

    expect(cancelled?.subject).toBe("訂單已取消：皮卡丘");
  });

  it("returns null for unknown template keys", () => {
    expect(renderEmailTemplate({ templateKey: "unknown.template" })).toBeNull();
  });
});
