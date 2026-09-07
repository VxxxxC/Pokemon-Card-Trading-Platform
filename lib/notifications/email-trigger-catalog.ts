/** Manual-test producer targets (enqueue → notification_email_outbox). Resend worker is shared. */

export type EmailTriggerBatch = "batch-a-cron" | "batch-b-action" | "batch-c-payout";

export type EmailTriggerSpec = {
  eventId: string;
  label: string;
  batch: EmailTriggerBatch;
  /** Cron path relative to site origin; omit for action-only triggers. */
  cronPath?: string;
  /** Human steps when DB seed + cron is not enough. */
  manualHint: string;
};

/** Unchecked rows in docs/dev/follow-up/email-notifications/manual-test.md (excluding meta sampling). */
export const PENDING_EMAIL_TRIGGER_SPECS: EmailTriggerSpec[] = [
  {
    eventId: "E-ORD-02",
    label: "待付款逾時",
    batch: "batch-a-cron",
    cronPath: "/api/cron/expire-merchant-pending-payment",
    manualHint:
      "merchant_orders pending_payment 逾 48h → rpc_list_merchant_pending_payment_expiry_candidates",
  },
  {
    eventId: "E-PAY-02",
    label: "Connect 撥款成功",
    batch: "batch-c-payout",
    manualHint:
      "merchant-connect-payout-ready cron 或 executeMerchantConnectPayout 成功",
  },
  {
    eventId: "E-ORD-07",
    label: "買家確認收貨 reminder",
    batch: "batch-a-cron",
    cronPath: "/api/cron/order-fulfillment-reminders",
    manualHint: "escrow shipped + buyer_confirmed_at null + updated_at > 3d",
  },
  {
    eventId: "E-ORD-08",
    label: "賣家發貨 reminder",
    batch: "batch-a-cron",
    cronPath: "/api/cron/order-fulfillment-reminders",
    manualHint: "payment_held + paid_at > 3d（merchant）或 custody 未 inbound（member auth）",
  },
  {
    eventId: "E-MCH-04",
    label: "Connect onboarding reminder",
    batch: "batch-a-cron",
    cronPath: "/api/cron/merchant-connect-onboarding-reminder",
    manualHint: "kyc verified 48h+，stripe charges/payouts 未齊",
  },
  {
    eventId: "E-MOD-05",
    label: "撥款凍結解除",
    batch: "batch-b-action",
    manualHint: "Admin resolve dismissed + subject 曾有 freeze_payout",
  },
  {
    eventId: "E-RWD-01",
    label: "積分兌換 / 券發放",
    batch: "batch-b-action",
    manualHint: "redeemRewardCatalogItem",
  },
  {
    eventId: "E-ACC-08",
    label: "制裁到期解除",
    batch: "batch-a-cron",
    cronPath: "/api/cron/sanction-expiry-notifications",
    manualHint: "account_sanctions ends_at 在過去 25h 內、非 ban",
  },
  {
    eventId: "E-ACC-09",
    label: "新制裁（非 suspend/ban）",
    batch: "batch-b-action",
    manualHint: "Admin resolve upheld + restrict_listing 等",
  },
  {
    eventId: "E-REF-03",
    label: "退款失敗",
    batch: "batch-b-action",
    manualHint: "仲裁退款 saga fail / Stripe refund fail webhook",
  },
  {
    eventId: "E-GRD-B2C-09",
    label: "商戶鑑定 Connect 撥款完成",
    batch: "batch-c-payout",
    manualHint: "B2C grading Connect payout 完成",
  },
  {
    eventId: "E-PAY-01",
    label: "Connect 撥款處理中",
    batch: "batch-c-payout",
    manualHint: "executeMerchantConnectPayout 進入 processing",
  },
];

export const PENDING_EMAIL_TRIGGER_EVENT_IDS = PENDING_EMAIL_TRIGGER_SPECS.map(
  (spec) => spec.eventId,
);

export function cronPathsForBatch(batch: EmailTriggerBatch): string[] {
  const paths = new Set<string>();
  for (const spec of PENDING_EMAIL_TRIGGER_SPECS) {
    if (spec.batch === batch && spec.cronPath) {
      paths.add(spec.cronPath);
    }
  }
  return [...paths];
}
