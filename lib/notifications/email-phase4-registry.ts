/** Phase 4 email catalog (cron reminders + rewards P2). */
export type Phase4EmailCatalogEntry = {
  eventId: string;
  templateKey: string;
  samplePayload: Record<string, unknown>;
  idempotencyKey: string;
};

const LOGO = "https://cardvaulthk.com/asset/logo.png";
const TRADING = "https://cardvaulthk.com/profile/user/trading";
const BUYER_ORDER = "https://cardvaulthk.com/profile/user/orderDetail/ord-1";
const MERCHANT_ORDER = "https://cardvaulthk.com/profile/merchant/orderDetail/ord-1";
const FINANCE = "https://cardvaulthk.com/profile/merchant/finance";
const REWARDS = "https://cardvaulthk.com/profile/user/rewards";

export const PHASE4_EMAIL_CATALOG: Phase4EmailCatalogEntry[] = [
  {
    eventId: "E-ORD-07",
    templateKey: "order.confirm_reminder",
    idempotencyKey: "E-ORD-07:ord-1:buyer:2026-08-31",
    samplePayload: {
      cardName: "皮卡丘",
      actionUrl: BUYER_ORDER,
      logoUrl: LOGO,
    },
  },
  {
    eventId: "E-ORD-08",
    templateKey: "order.ship_reminder",
    idempotencyKey: "E-ORD-08:ord-1:seller:2026-08-31",
    samplePayload: {
      cardName: "皮卡丘",
      actionUrl: MERCHANT_ORDER,
      logoUrl: LOGO,
    },
  },
  {
    eventId: "E-MCH-04",
    templateKey: "mch.connect_onboarding_reminder",
    idempotencyKey: "E-MCH-04:user-1:reminder:2026-08-31",
    samplePayload: { actionUrl: FINANCE, logoUrl: LOGO },
  },
  {
    eventId: "E-MOD-05",
    templateKey: "mod.payout_unfrozen",
    idempotencyKey: "E-MOD-05:case-1:subject",
    samplePayload: { caseNumber: "CASE-1", actionUrl: TRADING, logoUrl: LOGO },
  },
  {
    eventId: "E-RWD-01",
    templateKey: "rewards.grant",
    idempotencyKey: "E-RWD-01:ur-1:grant",
    samplePayload: {
      itemName: "免運券",
      pointsLabel: "-100",
      actionUrl: REWARDS,
      logoUrl: LOGO,
    },
  },
  {
    eventId: "E-RWD-02",
    templateKey: "rewards.coupon_expiring",
    idempotencyKey: "E-RWD-02:ur-1:expiring:2026-08-31",
    samplePayload: {
      expiryLabel: "2026-09-05",
      actionUrl: REWARDS,
      logoUrl: LOGO,
    },
  },
];

export const PHASE4_EVENT_IDS = PHASE4_EMAIL_CATALOG.map((e) => e.eventId);
export const PHASE4_TEMPLATE_KEYS = PHASE4_EMAIL_CATALOG.map((e) => e.templateKey);
