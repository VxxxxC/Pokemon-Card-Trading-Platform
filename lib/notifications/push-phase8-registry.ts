export type PushEventCatalogEntry = {
  eventId: string;
  templateKey: string;
  samplePayload: Record<string, string | number>;
};

export const PHASE8_PUSH_CATALOG: PushEventCatalogEntry[] = [
  {
    eventId: "P-CHT-01",
    templateKey: "chat.unread_daily_digest",
    samplePayload: {
      unreadCount: 3,
    },
  },
];

export const PHASE8_EVENT_IDS = PHASE8_PUSH_CATALOG.map((entry) => entry.eventId);

export const PHASE8_TEMPLATE_KEYS = PHASE8_PUSH_CATALOG.map(
  (entry) => entry.templateKey,
);
