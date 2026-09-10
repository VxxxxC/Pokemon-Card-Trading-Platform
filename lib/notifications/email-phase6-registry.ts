/** Phase 6 email catalog (remaining P0/P1 triggers). */
export type Phase6EmailCatalogEntry = {
  eventId: string;
  templateKey: string;
  samplePayload: Record<string, unknown>;
  idempotencyKey: string;
};

const LOGO = "https://cardvaulthk.com/asset/logo.png";
const TRADING = "https://cardvaulthk.com/profile/user/trading";
const BUYER_ORDER = "https://cardvaulthk.com/profile/user/orderDetail/ord-1";
const FINANCE = "https://cardvaulthk.com/profile/merchant/finance";

export const PHASE6_EMAIL_CATALOG: Phase6EmailCatalogEntry[] = [
  {
    eventId: "E-REF-03",
    templateKey: "refund.failed",
    idempotencyKey: "E-REF-03:case-1:failed",
    samplePayload: {
      errorMessage: "card_declined",
      actionUrl: BUYER_ORDER,
      logoUrl: LOGO,
    },
  },
  {
    eventId: "E-ACC-02",
    templateKey: "acc.email_verified",
    idempotencyKey: "E-ACC-02:user-1:verified",
    samplePayload: { actionUrl: TRADING, logoUrl: LOGO },
  },
  {
    eventId: "E-GRD-B2C-01",
    templateKey: "grading.b2c.awaiting_payment",
    idempotencyKey: "E-GRD-B2C-01:ord-1:buyer",
    samplePayload: {
      cardName: "皮卡丘",
      actionUrl: BUYER_ORDER,
      logoUrl: LOGO,
    },
  },
  {
    eventId: "E-GRD-B2C-09",
    templateKey: "grading.b2c.payout_completed",
    idempotencyKey: "E-GRD-B2C-09:ord-1:merchant",
    samplePayload: {
      cardName: "皮卡丘",
      amountLabel: "HK$500",
      actionUrl: FINANCE,
      logoUrl: LOGO,
    },
  },
  {
    eventId: "E-PAY-01",
    templateKey: "payout.processing",
    idempotencyKey: "E-PAY-01:ord-1:processing",
    samplePayload: { actionUrl: FINANCE, logoUrl: LOGO },
  },
  {
    eventId: "E-ORD-P2P-01",
    templateKey: "p2p.meetup_arranged",
    idempotencyKey: "E-ORD-P2P-01:ord-1:buyer",
    samplePayload: {
      cardName: "皮卡丘",
      actionUrl: BUYER_ORDER,
      logoUrl: LOGO,
    },
  },
  {
    eventId: "E-ORD-P2P-02",
    templateKey: "p2p.meetup_completed",
    idempotencyKey: "E-ORD-P2P-02:ord-1:seller",
    samplePayload: {
      cardName: "皮卡丘",
      actionUrl: BUYER_ORDER,
      logoUrl: LOGO,
    },
  },
  {
    eventId: "E-ORD-09",
    templateKey: "order.review_invite",
    idempotencyKey: "E-ORD-09:ord-1:buyer",
    samplePayload: {
      cardName: "皮卡丘",
      actionUrl: BUYER_ORDER,
      logoUrl: LOGO,
    },
  },
];

export const PHASE6_EVENT_IDS = PHASE6_EMAIL_CATALOG.map((e) => e.eventId);
export const PHASE6_TEMPLATE_KEYS = PHASE6_EMAIL_CATALOG.map((e) => e.templateKey);
