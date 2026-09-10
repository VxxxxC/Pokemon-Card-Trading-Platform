/** Phase 3 transactional email catalog (P0 + P1) — gate tests. */
export type Phase3EmailCatalogEntry = {
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
const MERCHANT_APPLY = "https://cardvaulthk.com/profile/user/merchant-apply";

export const PHASE3_EMAIL_CATALOG: Phase3EmailCatalogEntry[] = [
  { eventId: "E-REF-01", templateKey: "refund.approved", idempotencyKey: "E-REF-01:case-1:buyer", samplePayload: { amountLabel: "HK$100", actionUrl: BUYER_ORDER, logoUrl: LOGO } },
  { eventId: "E-REF-02", templateKey: "refund.completed", idempotencyKey: "E-REF-02:re-1", samplePayload: { amountLabel: "HK$100", actionUrl: BUYER_ORDER, logoUrl: LOGO } },
  { eventId: "E-MCH-01", templateKey: "mch.application_submitted", idempotencyKey: "E-MCH-01:user-1:submitted", samplePayload: { actionUrl: MERCHANT_APPLY, logoUrl: LOGO } },
  { eventId: "E-MCH-02", templateKey: "mch.kyc_approved", idempotencyKey: "E-MCH-02:user-1:approved", samplePayload: { actionUrl: "https://cardvaulthk.com/profile/merchant", logoUrl: LOGO } },
  { eventId: "E-MCH-03", templateKey: "mch.kyc_rejected", idempotencyKey: "E-MCH-03:user-1:rejected", samplePayload: { rejectReason: "資料不全", actionUrl: MERCHANT_APPLY, logoUrl: LOGO } },
  { eventId: "E-MCH-05", templateKey: "mch.connect_enabled", idempotencyKey: "E-MCH-05:user-1:connect_enabled", samplePayload: { actionUrl: FINANCE, logoUrl: LOGO } },
  { eventId: "E-ACC-06", templateKey: "acc.suspended", idempotencyKey: "E-ACC-06:case-1:subject", samplePayload: { actionUrl: TRADING, logoUrl: LOGO } },
  { eventId: "E-ACC-07", templateKey: "acc.banned", idempotencyKey: "E-ACC-07:case-1:subject", samplePayload: { actionUrl: TRADING, logoUrl: LOGO } },
  { eventId: "E-MOD-01", templateKey: "mod.report_received", idempotencyKey: "E-MOD-01:report-1:received", samplePayload: { caseNumber: "CASE-1", actionUrl: TRADING, logoUrl: LOGO } },
  { eventId: "E-MOD-03", templateKey: "mod.report_upheld_subject", idempotencyKey: "E-MOD-03:case-1:subject", samplePayload: { caseNumber: "CASE-1", actionUrl: TRADING, logoUrl: LOGO } },
  { eventId: "E-MOD-04", templateKey: "mod.payout_frozen", idempotencyKey: "E-MOD-04:case-1:subject", samplePayload: { caseNumber: "CASE-1", actionUrl: TRADING, logoUrl: LOGO } },
  { eventId: "E-PAY-03", templateKey: "payout.failed", idempotencyKey: "E-PAY-03:ord-1:failed", samplePayload: { actionUrl: FINANCE, logoUrl: LOGO } },
  { eventId: "E-PAY-04", templateKey: "payout.fps_completed", idempotencyKey: "E-PAY-04:ord-1:fps", samplePayload: { amountLabel: "HK$200", logoUrl: LOGO } },
  { eventId: "E-PAY-05", templateKey: "payout.recovery_due", idempotencyKey: "E-PAY-05:ord-1:recovery", samplePayload: { amountLabel: "HK$50", actionUrl: MERCHANT_ORDER, logoUrl: LOGO } },
  { eventId: "E-GRD-B2C-07", templateKey: "grading.b2c.fail_settlement", idempotencyKey: "E-GRD-B2C-07:ord-1:merchant", samplePayload: { cardName: "皮卡丘", actionUrl: MERCHANT_ORDER, logoUrl: LOGO } },
  { eventId: "E-GRD-C2C-02", templateKey: "grading.c2c.inbound_shipped", idempotencyKey: "E-GRD-C2C-02:ord-1:buyer", samplePayload: { cardName: "皮卡丘", trackingNo: "SF123", actionUrl: BUYER_ORDER, logoUrl: LOGO } },
  { eventId: "E-GRD-C2C-03", templateKey: "grading.c2c.intake", idempotencyKey: "E-GRD-C2C-03:ord-1:buyer", samplePayload: { cardName: "皮卡丘", recipientRole: "buyer", actionUrl: BUYER_ORDER, logoUrl: LOGO } },
  { eventId: "E-GRD-C2C-08", templateKey: "grading.c2c.seller_return", idempotencyKey: "E-GRD-C2C-08:ord-1:seller", samplePayload: { cardName: "皮卡丘", actionUrl: BUYER_ORDER, logoUrl: LOGO } },
  { eventId: "E-GRD-C2C-09", templateKey: "grading.c2c.buyer_confirmed", idempotencyKey: "E-GRD-C2C-09:ord-1:seller", samplePayload: { cardName: "皮卡丘", actionUrl: BUYER_ORDER, logoUrl: LOGO } },
  { eventId: "E-GRD-C2C-10", templateKey: "grading.c2c.payout_released", idempotencyKey: "E-GRD-C2C-10:ord-1:seller", samplePayload: { cardName: "皮卡丘", actionUrl: BUYER_ORDER, logoUrl: LOGO } },
  { eventId: "E-GRD-B2C-03", templateKey: "grading.b2c.inbound_shipped", idempotencyKey: "E-GRD-B2C-03:ord-1:buyer", samplePayload: { cardName: "皮卡丘", actionUrl: BUYER_ORDER, logoUrl: LOGO } },
  { eventId: "E-GRD-B2C-04", templateKey: "grading.b2c.authenticating", idempotencyKey: "E-GRD-B2C-04:ord-1:buyer", samplePayload: { cardName: "皮卡丘", recipientRole: "buyer", actionUrl: BUYER_ORDER, logoUrl: LOGO } },
  { eventId: "E-GRD-B2C-08", templateKey: "grading.b2c.buyer_confirmed", idempotencyKey: "E-GRD-B2C-08:ord-1:merchant", samplePayload: { cardName: "皮卡丘", actionUrl: MERCHANT_ORDER, logoUrl: LOGO } },
  { eventId: "E-ORD-06", templateKey: "order.completed", idempotencyKey: "E-ORD-06:ord-1:buyer", samplePayload: { cardName: "皮卡丘", actionUrl: BUYER_ORDER, logoUrl: LOGO } },
  { eventId: "E-ORD-B2C-01", templateKey: "b2c.payment_merchant_action", idempotencyKey: "E-ORD-B2C-01:ord-1:merchant", samplePayload: { cardName: "皮卡丘", actionUrl: MERCHANT_ORDER, logoUrl: LOGO } },
  { eventId: "E-ORD-B2C-02", templateKey: "b2c.shipped", idempotencyKey: "E-ORD-B2C-02:ord-1:buyer", samplePayload: { cardName: "皮卡丘", actionUrl: BUYER_ORDER, logoUrl: LOGO } },
  { eventId: "E-ORD-B2C-03", templateKey: "b2c.completed", idempotencyKey: "E-ORD-B2C-03:ord-1:merchant", samplePayload: { cardName: "皮卡丘", actionUrl: FINANCE, logoUrl: LOGO } },
];

export const PHASE3_EVENT_IDS = PHASE3_EMAIL_CATALOG.map((e) => e.eventId);
export const PHASE3_TEMPLATE_KEYS = PHASE3_EMAIL_CATALOG.map((e) => e.templateKey);
