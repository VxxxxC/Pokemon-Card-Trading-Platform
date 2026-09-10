/**
 * Stripe webhook events handled by `app/api/stripe/webhook/route.ts`.
 * SSOT for Dashboard / CLI `stripe listen --events` / `stripe webhook_endpoints` sync.
 */
export const STRIPE_WEBHOOK_EVENTS = [
  "account.updated",
  "payment_intent.amount_capturable_updated",
  "payment_intent.succeeded",
  "payment_intent.canceled",
  "payment_intent.payment_failed",
  "transfer.created",
  "refund.created",
] as const;

export type StripeWebhookEvent = (typeof STRIPE_WEBHOOK_EVENTS)[number];

/** Comma-separated list for `stripe listen --events`. */
export const STRIPE_WEBHOOK_EVENTS_CSV = STRIPE_WEBHOOK_EVENTS.join(",");

export const STRIPE_WEBHOOK_PATH = "/api/stripe/webhook";
