export type PushEventCatalogEntry = {
  eventId: string;
  templateKey: string;
  samplePayload: Record<string, string | number>;
};

export const PHASE2_PUSH_CATALOG: PushEventCatalogEntry[] = [
  {
    eventId: "P-OFF-01",
    templateKey: "offer.received",
    samplePayload: {
      cardName: "皮卡丘 VMAX",
      buyerName: "Ash",
      offerPrice: 1200,
    },
  },
  {
    eventId: "P-OFF-02",
    templateKey: "offer.accepted",
    samplePayload: {
      cardName: "皮卡丘 VMAX",
      sellerName: "Misty",
      offerPrice: 1200,
    },
  },
  {
    eventId: "P-OFF-03",
    templateKey: "offer.rejected",
    samplePayload: {
      cardName: "皮卡丘 VMAX",
      sellerName: "Misty",
      offerPrice: 1200,
    },
  },
  {
    eventId: "P-OFF-04",
    templateKey: "offer.buy_now",
    samplePayload: {
      cardName: "皮卡丘 VMAX",
      buyerName: "Ash",
      offerPrice: 1500,
    },
  },
];

export const PHASE2_EVENT_IDS = PHASE2_PUSH_CATALOG.map((entry) => entry.eventId);

export const PHASE2_TEMPLATE_KEYS = PHASE2_PUSH_CATALOG.map(
  (entry) => entry.templateKey,
);
