import type Stripe from "stripe";

/** Merchant B2C checkout: card only (hide wallets / WeChat / Alipay). */
export const MERCHANT_CHECKOUT_PAYMENT_METHOD_TYPES = ["card"] as const;

/** PI metadata flag for single full capture at grading pass. */
export const AUTH_ESCROW_CAPTURE_MODEL_SINGLE = "single" as const;
