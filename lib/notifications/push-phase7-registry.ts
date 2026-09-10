export type PushEventCatalogEntry = {
  eventId: string;
  templateKey: string;
  samplePayload: Record<string, string | number>;
};

export const PHASE7_PUSH_CATALOG: PushEventCatalogEntry[] = [
  {
    eventId: "P-MOD-01",
    templateKey: "mod.report_outcome",
    samplePayload: {
      resolutionLabel: "舉報成立",
      caseNumber: "MOD-2026-001",
    },
  },
  {
    eventId: "P-MOD-02",
    templateKey: "mod.sanction_applied",
    samplePayload: {
      sanctionLabel: "帳戶暫停",
      caseNumber: "MOD-2026-001",
    },
  },
];

export const PHASE7_EVENT_IDS = PHASE7_PUSH_CATALOG.map((entry) => entry.eventId);

export const PHASE7_TEMPLATE_KEYS = PHASE7_PUSH_CATALOG.map(
  (entry) => entry.templateKey,
);
