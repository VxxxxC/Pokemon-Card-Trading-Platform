import type Stripe from "stripe";
import { stripe } from "@/lib/stripe";

export async function createMerchantExpressLoginLink(
  stripeAccountId: string,
): Promise<Stripe.LoginLink> {
  return stripe.accounts.createLoginLink(stripeAccountId);
}

export function maskStripeAccountId(accountId: string): string {
  if (accountId.length <= 12) {
    return accountId;
  }
  return `${accountId.slice(0, 8)}…${accountId.slice(-4)}`;
}
