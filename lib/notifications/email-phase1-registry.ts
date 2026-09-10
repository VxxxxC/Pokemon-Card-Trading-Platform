/** Phase 1 transactional email catalog — SSOT for gate tests + manual smoke checklist. */
export type Phase1EmailCatalogEntry = {
  eventId: string;
  templateKey: string;
  samplePayload: Record<string, unknown>;
  idempotencyKey: string;
};

const LOGO = "https://cardvaulthk.com/asset/logo.png";
const BUYER_ORDER = "https://cardvaulthk.com/profile/user/orderDetail/ord-1";
const MERCHANT_ORDER = "https://cardvaulthk.com/profile/merchant/orderDetail/ord-1";
const TRADING = "https://cardvaulthk.com/profile/user/trading";

export const PHASE1_EMAIL_CATALOG: Phase1EmailCatalogEntry[] = [
  {
    eventId: "E-ACC-04",
    templateKey: "acc.password_changed",
    idempotencyKey: "E-ACC-04:user-1:1",
    samplePayload: { logoUrl: LOGO },
  },
  {
    eventId: "E-OFF-01",
    templateKey: "offer.received",
    idempotencyKey: "E-OFF-01:offer-1:received",
    samplePayload: {
      cardName: "皮卡丘",
      buyerName: "買家A",
      offerPriceLabel: "HK$299",
      actionUrl: TRADING,
      logoUrl: LOGO,
    },
  },
  {
    eventId: "E-OFF-02",
    templateKey: "offer.countered",
    idempotencyKey: "E-OFF-02:offer-1:modified",
    samplePayload: {
      cardName: "皮卡丘",
      buyerName: "買家A",
      offerPriceLabel: "HK$320",
      actionUrl: TRADING,
      logoUrl: LOGO,
    },
  },
  {
    eventId: "E-OFF-03",
    templateKey: "offer.accepted",
    idempotencyKey: "E-OFF-03:offer-1:accepted",
    samplePayload: {
      cardName: "皮卡丘",
      sellerName: "商戶A",
      offerPriceLabel: "HK$299",
      actionUrl: BUYER_ORDER,
      logoUrl: LOGO,
    },
  },
  {
    eventId: "E-OFF-04",
    templateKey: "offer.rejected",
    idempotencyKey: "E-OFF-04:offer-1:rejected",
    samplePayload: {
      cardName: "皮卡丘",
      sellerName: "商戶A",
      offerPriceLabel: "HK$299",
      actionUrl: TRADING,
      logoUrl: LOGO,
    },
  },
  {
    eventId: "E-OFF-06",
    templateKey: "offer.buy_now",
    idempotencyKey: "E-OFF-06:offer-1:buy_now",
    samplePayload: {
      cardName: "皮卡丘",
      buyerName: "買家A",
      offerPriceLabel: "HK$500",
      actionUrl: MERCHANT_ORDER,
      logoUrl: LOGO,
    },
  },
  {
    eventId: "E-ORD-01",
    templateKey: "order.payment_confirmed",
    idempotencyKey: "E-ORD-01:ord-1:buyer",
    samplePayload: {
      recipientRole: "buyer",
      cardName: "皮卡丘",
      amountLabel: "HK$500",
      counterpartyName: "商戶A",
      actionUrl: BUYER_ORDER,
      logoUrl: LOGO,
    },
  },
  {
    eventId: "E-ORD-02",
    templateKey: "order.payment_expired",
    idempotencyKey: "E-ORD-02:ord-1:buyer",
    samplePayload: {
      recipientRole: "buyer",
      cardName: "皮卡丘",
      amountLabel: "HK$500",
      actionUrl: TRADING,
      logoUrl: LOGO,
    },
  },
  {
    eventId: "E-ORD-03",
    templateKey: "order.cancelled",
    idempotencyKey: "E-ORD-03:ord-1:buyer",
    samplePayload: {
      recipientRole: "buyer",
      cardName: "皮卡丘",
      actionUrl: BUYER_ORDER,
      logoUrl: LOGO,
    },
  },
  {
    eventId: "E-ORD-04",
    templateKey: "order.shipped",
    idempotencyKey: "E-ORD-04:ord-1:buyer",
    samplePayload: {
      cardName: "皮卡丘",
      sellerName: "商戶A",
      trackingNo: "SF123",
      courierName: "順豐",
      actionUrl: BUYER_ORDER,
      logoUrl: LOGO,
    },
  },
  {
    eventId: "E-ORD-05",
    templateKey: "order.buyer_confirmed",
    idempotencyKey: "E-ORD-05:ord-1:seller",
    samplePayload: {
      cardName: "皮卡丘",
      buyerName: "買家A",
      actionUrl: MERCHANT_ORDER,
      logoUrl: LOGO,
    },
  },
];

export const PHASE1_TEMPLATE_KEYS = PHASE1_EMAIL_CATALOG.map(
  (entry) => entry.templateKey,
);

export const PHASE1_EVENT_IDS = PHASE1_EMAIL_CATALOG.map(
  (entry) => entry.eventId,
);
