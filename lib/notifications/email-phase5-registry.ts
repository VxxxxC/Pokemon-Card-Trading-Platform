/** Phase 5A email catalog (Connect action, sanctions, evidence request). */
export type Phase5EmailCatalogEntry = {
  eventId: string;
  templateKey: string;
  samplePayload: Record<string, unknown>;
  idempotencyKey: string;
};

const LOGO = "https://cardvaulthk.com/asset/logo.png";
const TRADING = "https://cardvaulthk.com/profile/user/trading";
const FINANCE = "https://cardvaulthk.com/profile/merchant/finance";

export const PHASE5_EMAIL_CATALOG: Phase5EmailCatalogEntry[] = [
  {
    eventId: "E-MCH-06",
    templateKey: "mch.connect_action_required",
    idempotencyKey: "E-MCH-06:user-1:action:2026-08-31",
    samplePayload: {
      actionReason: "individual.verification.document",
      actionUrl: FINANCE,
      logoUrl: LOGO,
    },
  },
  {
    eventId: "E-ACC-08",
    templateKey: "acc.sanction_lifted",
    idempotencyKey: "E-ACC-08:sanction-1:lifted",
    samplePayload: {
      sanctionType: "suspend",
      sanctionLabel: "帳戶暫停",
      actionUrl: TRADING,
      logoUrl: LOGO,
    },
  },
  {
    eventId: "E-ACC-09",
    templateKey: "acc.sanction_applied",
    idempotencyKey: "E-ACC-09:case-1:restrict_listing",
    samplePayload: {
      sanctionType: "restrict_listing",
      sanctionLabel: "限制刊登",
      endsAt: "2026-09-15",
      reason: "違規刊登",
      actionUrl: TRADING,
      logoUrl: LOGO,
    },
  },
  {
    eventId: "E-MOD-06",
    templateKey: "mod.evidence_request",
    idempotencyKey: "E-MOD-06:case-1:subject",
    samplePayload: {
      caseNumber: "CASE-1",
      message: "請提供完整聊天截圖",
      actionUrl: TRADING,
      logoUrl: LOGO,
    },
  },
];

export const PHASE5_EVENT_IDS = PHASE5_EMAIL_CATALOG.map((e) => e.eventId);
export const PHASE5_TEMPLATE_KEYS = PHASE5_EMAIL_CATALOG.map((e) => e.templateKey);
