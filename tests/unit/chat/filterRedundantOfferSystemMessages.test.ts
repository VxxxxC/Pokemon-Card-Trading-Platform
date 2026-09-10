import { describe, expect, it } from "vitest";
import { filterRedundantOfferSystemMessages } from "@/app/lib/chat/filterRedundantOfferSystemMessages";
import {
  SYSTEM_OFFER_ACCEPTED_BUYER_BASE,
  SYSTEM_OFFER_ACCEPTED_SELLER_BASE,
  SYSTEM_OFFER_REJECTED_BUYER_TEXT,
  SYSTEM_OFFER_REJECTED_SELLER_TEXT,
} from "@/app/lib/chat/offerSystemMessageCopy";
import type { Message } from "@/app/store/useHkCardVaultStore";

function offerCardMessage(offerId: string): Message {
  return {
    id: "msg-offer",
    sender: "them",
    text: "出價",
    timestamp: "2026-01-01T10:00:00.000Z",
    type: "special_transaction",
    specialData: {
      cardName: "測試卡",
      cardId: "prod-1",
      offerPrice: 100,
      buyerName: "買家",
      buyerId: "buyer-1",
      sellerId: "seller-1",
      sellerName: "賣家",
      offerId,
      initialStatus: "accepted",
    },
  };
}

function systemOfferMessage(
  id: string,
  text: string,
  offerId?: string,
): Message {
  return {
    id,
    sender: "system",
    text,
    timestamp: "2026-01-01T10:01:00.000Z",
    type: "text",
    offerId,
  };
}

describe("filterRedundantOfferSystemMessages", () => {
  it("removes accept/reject system bubbles when matching offer card exists", () => {
    const offerId = "offer-1";
    const messages = [
      offerCardMessage(offerId),
      systemOfferMessage("sys-accept", SYSTEM_OFFER_ACCEPTED_BUYER_BASE, offerId),
      systemOfferMessage("sys-reject", SYSTEM_OFFER_REJECTED_BUYER_TEXT, offerId),
    ];

    const filtered = filterRedundantOfferSystemMessages(messages);
    expect(filtered.map((m) => m.id)).toEqual(["msg-offer"]);
  });

  it("keeps system bubbles when offer_id does not match any card", () => {
    const messages = [
      offerCardMessage("offer-1"),
      systemOfferMessage(
        "sys-other",
        SYSTEM_OFFER_REJECTED_BUYER_TEXT,
        "offer-other",
      ),
    ];

    const filtered = filterRedundantOfferSystemMessages(messages);
    expect(filtered.map((m) => m.id)).toEqual(["msg-offer", "sys-other"]);
  });

  it("removes seller-facing accept copy when matching offer card exists", () => {
    const offerId = "offer-1";
    const messages = [
      offerCardMessage(offerId),
      systemOfferMessage(
        "sys-accept-seller",
        SYSTEM_OFFER_ACCEPTED_SELLER_BASE,
        offerId,
      ),
    ];

    const filtered = filterRedundantOfferSystemMessages(messages);
    expect(filtered.map((m) => m.id)).toEqual(["msg-offer"]);
  });

  it("removes seller-facing reject copy when matching offer card exists", () => {
    const offerId = "offer-1";
    const messages = [
      offerCardMessage(offerId),
      systemOfferMessage(
        "sys-reject-seller",
        SYSTEM_OFFER_REJECTED_SELLER_TEXT,
        offerId,
      ),
    ];

    const filtered = filterRedundantOfferSystemMessages(messages);
    expect(filtered.map((m) => m.id)).toEqual(["msg-offer"]);
  });

  it("keeps unrelated system messages", () => {
    const messages = [
      offerCardMessage("offer-1"),
      {
        id: "sys-order",
        sender: "system",
        text: "✅ 交易已順利完成",
        timestamp: "2026-01-01T10:02:00.000Z",
        type: "system_order_completed",
      },
    ];

    const filtered = filterRedundantOfferSystemMessages(messages);
    expect(filtered.map((m) => m.id)).toEqual(["msg-offer", "sys-order"]);
  });
});
