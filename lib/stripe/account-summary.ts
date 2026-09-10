import type Stripe from "stripe";
import { stripe } from "@/lib/stripe";
import { getStripeConnectDashboardUrl } from "@/lib/stripe/dashboard-urls";

export { getStripeConnectDashboardUrl } from "@/lib/stripe/dashboard-urls";

export type StripePayoutBankAccount = {
  id: string;
  bankName: string | null;
  last4: string;
  accountHolderName: string | null;
  currency: string;
  status: string;
  defaultForCurrency: boolean;
};

export type StripeAccountPayoutSummary = {
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  dashboardUrl: string;
  bankAccounts: StripePayoutBankAccount[];
};

function mapBankAccount(account: Stripe.BankAccount): StripePayoutBankAccount {
  return {
    id: account.id,
    bankName: account.bank_name ?? null,
    last4: account.last4 ?? "????",
    accountHolderName: account.account_holder_name ?? null,
    currency: account.currency,
    status: account.status ?? "unknown",
    defaultForCurrency: account.default_for_currency ?? false,
  };
}

/**
 * Read-only Stripe Connect payout summary for admin review.
 * Never returns full account or routing numbers — only masked last4.
 */
export async function getStripeAccountPayoutSummary(
  stripeAccountId: string,
): Promise<StripeAccountPayoutSummary> {
  const account = await stripe.accounts.retrieve(stripeAccountId, {
    expand: ["external_accounts"],
  });

  const externalAccounts = account.external_accounts?.data ?? [];
  const bankAccounts = externalAccounts
    .filter((item): item is Stripe.BankAccount => item.object === "bank_account")
    .map(mapBankAccount);

  return {
    chargesEnabled: account.charges_enabled ?? false,
    payoutsEnabled: account.payouts_enabled ?? false,
    dashboardUrl: getStripeConnectDashboardUrl(stripeAccountId),
    bankAccounts,
  };
}
