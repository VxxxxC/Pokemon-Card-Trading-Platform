import type Stripe from "stripe";

/**
 * `lib/stripe.ts` 於 module 載入時就會因缺少 STRIPE_SECRET_KEY 而 throw，
 * 因此任何有機會在 prerender / CI（無 .env）階段被求值的模組都要經此 lazy getter，
 * 唔可以直接 top-level import。
 */
export function isStripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

export function getStripePublishableKey(): string | null {
  return process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? null;
}

export async function getStripeClient(): Promise<Stripe | null> {
  if (!isStripeConfigured()) {
    return null;
  }

  const { stripe } = await import("@/lib/stripe");
  return stripe;
}
