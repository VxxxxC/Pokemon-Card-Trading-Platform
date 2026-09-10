/** Phase 2 transactional email catalog — SSOT for gate tests + manual smoke checklist. */
export type Phase2EmailCatalogEntry = {
  eventId: string;
  templateKey: string;
  samplePayload: Record<string, unknown>;
  idempotencyKey: string;
};

const LOGO = "https://cardvaulthk.com/asset/logo.png";
const BUYER_ORDER = "https://cardvaulthk.com/profile/user/orderDetail/ord-1";
const MERCHANT_ORDER = "https://cardvaulthk.com/profile/merchant/orderDetail/ord-1";
const MEMBER_SELL_ORDER = "https://cardvaulthk.com/profile/user/orderDetail/ord-1";
const TRADING = "https://cardvaulthk.com/profile/user/trading";
const FINANCE = "https://cardvaulthk.com/profile/merchant/finance";

export const PHASE2_EMAIL_CATALOG: Phase2EmailCatalogEntry[] = [
  {
    eventId: "E-MOD-02",
    templateKey: "mod.report_outcome",
    idempotencyKey: "E-MOD-02:report-1:outcome",
    samplePayload: {
      caseNumber: "CASE-001",
      resolution: "upheld",
      resolutionLabel: "舉報成立",
      actionUrl: TRADING,
      logoUrl: LOGO,
    },
  },
  {
    eventId: "E-PAY-02",
    templateKey: "payout.completed",
    idempotencyKey: "E-PAY-02:ord-1:completed",
    samplePayload: {
      orderId: "ord-1",
      amountLabel: "HK$420",
      orderNumber: "ORD-2026-ABC123",
      actionUrl: FINANCE,
      logoUrl: LOGO,
    },
  },
  {
    eventId: "E-GRD-C2C-01",
    templateKey: "grading.c2c.ship_to_platform",
    idempotencyKey: "E-GRD-C2C-01:ord-1:seller",
    samplePayload: {
      cardName: "皮卡丘",
      orderNumber: "ORD-2026-ABC123",
      actionUrl: MEMBER_SELL_ORDER,
      logoUrl: LOGO,
    },
  },
  {
    eventId: "E-GRD-C2C-05",
    templateKey: "grading.c2c.passed_shipped",
    idempotencyKey: "E-GRD-C2C-05:ord-1:buyer",
    samplePayload: {
      recipientRole: "buyer",
      cardName: "皮卡丘",
      orderNumber: "ORD-2026-ABC123",
      trackingNo: "SF1234567890",
      actionUrl: BUYER_ORDER,
      logoUrl: LOGO,
    },
  },
  {
    eventId: "E-GRD-C2C-06",
    templateKey: "grading.c2c.failed",
    idempotencyKey: "E-GRD-C2C-06:ord-1:buyer",
    samplePayload: {
      recipientRole: "buyer",
      cardName: "皮卡丘",
      orderNumber: "ORD-2026-ABC123",
      actionUrl: BUYER_ORDER,
      logoUrl: LOGO,
    },
  },
  {
    eventId: "E-GRD-C2C-07",
    templateKey: "grading.c2c.refund",
    idempotencyKey: "E-GRD-C2C-07:ord-1:buyer",
    samplePayload: {
      cardName: "皮卡丘",
      orderNumber: "ORD-2026-ABC123",
      amountLabel: "HK$500",
      actionUrl: BUYER_ORDER,
      logoUrl: LOGO,
    },
  },
  {
    eventId: "E-GRD-B2C-02",
    templateKey: "grading.b2c.merchant_ship_in",
    idempotencyKey: "E-GRD-B2C-02:ord-1:merchant",
    samplePayload: {
      cardName: "皮卡丘",
      orderNumber: "ORD-2026-ABC123",
      actionUrl: MERCHANT_ORDER,
      logoUrl: LOGO,
    },
  },
  {
    eventId: "E-GRD-B2C-05",
    templateKey: "grading.b2c.passed_shipped",
    idempotencyKey: "E-GRD-B2C-05:ord-1:buyer",
    samplePayload: {
      recipientRole: "buyer",
      cardName: "皮卡丘",
      orderNumber: "ORD-2026-ABC123",
      trackingNo: "SF1234567890",
      actionUrl: BUYER_ORDER,
      logoUrl: LOGO,
    },
  },
  {
    eventId: "E-GRD-B2C-06",
    templateKey: "grading.b2c.failed",
    idempotencyKey: "E-GRD-B2C-06:ord-1:buyer",
    samplePayload: {
      recipientRole: "buyer",
      cardName: "皮卡丘",
      orderNumber: "ORD-2026-ABC123",
      actionUrl: BUYER_ORDER,
      logoUrl: LOGO,
    },
  },
  {
    eventId: "E-OFF-05",
    templateKey: "offer.expired",
    idempotencyKey: "E-OFF-05:offer-1:expired",
    samplePayload: {
      cardName: "皮卡丘",
      offerPriceLabel: "HK$299",
      reason: "listing_inactive",
      actionUrl: TRADING,
      logoUrl: LOGO,
    },
  },
];

export const PHASE2_EVENT_IDS = PHASE2_EMAIL_CATALOG.map((entry) => entry.eventId);
export const PHASE2_TEMPLATE_KEYS = PHASE2_EMAIL_CATALOG.map(
  (entry) => entry.templateKey,
);
