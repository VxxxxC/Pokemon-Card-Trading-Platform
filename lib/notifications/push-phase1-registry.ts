export type PushEventCatalogEntry = {
  eventId: string;
  templateKey: string;
  samplePayload: Record<string, string | number>;
};

export const PHASE1_PUSH_CATALOG: PushEventCatalogEntry[] = [
  {
    eventId: "P-WIS-01",
    templateKey: "wishlist.price_hit_target",
    samplePayload: {
      productName: "皮卡丘 VMAX",
      gradeLabel: "PSA 10",
      lowestPrice: 1200,
      targetPrice: 1500,
    },
  },
];

export const PHASE1_EVENT_IDS = PHASE1_PUSH_CATALOG.map((entry) => entry.eventId);

export const PHASE1_TEMPLATE_KEYS = PHASE1_PUSH_CATALOG.map(
  (entry) => entry.templateKey,
);
