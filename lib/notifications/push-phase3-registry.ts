export type PushEventCatalogEntry = {
  eventId: string;
  templateKey: string;
  samplePayload: Record<string, string | number>;
};

export const PHASE3_PUSH_CATALOG: PushEventCatalogEntry[] = [
  {
    eventId: "P-ORD-01",
    templateKey: "order.payment_confirmed_seller",
    samplePayload: {
      cardName: "皮卡丘 VMAX",
      buyerName: "Ash",
      amountLabel: "HK$1,200",
    },
  },
  {
    eventId: "P-ORD-02",
    templateKey: "order.shipped_buyer",
    samplePayload: {
      cardName: "皮卡丘 VMAX",
      sellerName: "Card Vault Shop",
      trackingNo: "SF123456",
    },
  },
  {
    eventId: "P-ORD-03",
    templateKey: "order.payment_expired_buyer",
    samplePayload: {
      cardName: "皮卡丘 VMAX",
      amountLabel: "HK$1,200",
    },
  },
];

export const PHASE3_EVENT_IDS = PHASE3_PUSH_CATALOG.map((entry) => entry.eventId);

export const PHASE3_TEMPLATE_KEYS = PHASE3_PUSH_CATALOG.map(
  (entry) => entry.templateKey,
);
