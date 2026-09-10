export type PushEventCatalogEntry = {
  eventId: string;
  templateKey: string;
  samplePayload: Record<string, string | number>;
};

export const PHASE9A_PUSH_CATALOG: PushEventCatalogEntry[] = [
  {
    eventId: "P-ORD-04",
    templateKey: "order.buyer_confirmed_seller",
    samplePayload: {
      cardName: "皮卡丘 VMAX",
      buyerName: "Ash",
    },
  },
  {
    eventId: "P-ORD-05",
    templateKey: "order.completed",
    samplePayload: {
      cardName: "皮卡丘 VMAX",
    },
  },
  {
    eventId: "P-ORD-06",
    templateKey: "order.confirm_reminder",
    samplePayload: {
      cardName: "皮卡丘 VMAX",
    },
  },
  {
    eventId: "P-ORD-07",
    templateKey: "order.ship_reminder",
    samplePayload: {
      cardName: "皮卡丘 VMAX",
    },
  },
  {
    eventId: "P-ORD-08",
    templateKey: "order.review_invite",
    samplePayload: {
      cardName: "皮卡丘 VMAX",
    },
  },
];

export const PHASE9A_EVENT_IDS = PHASE9A_PUSH_CATALOG.map(
  (entry) => entry.eventId,
);

export const PHASE9A_TEMPLATE_KEYS = PHASE9A_PUSH_CATALOG.map(
  (entry) => entry.templateKey,
);
