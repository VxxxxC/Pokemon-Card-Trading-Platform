import type Stripe from "stripe";

/**
 * True when Stripe Connect account still needs merchant action (requirements due / disabled).
 */
export function stripeConnectAccountNeedsAction(
  account: Pick<
    Stripe.Account,
    "charges_enabled" | "payouts_enabled" | "requirements"
  >,
): boolean {
  if (account.charges_enabled === true && account.payouts_enabled === true) {
    return false;
  }

  const requirements = account.requirements;
  if (!requirements) {
    return account.charges_enabled !== true || account.payouts_enabled !== true;
  }

  if ((requirements.currently_due?.length ?? 0) > 0) return true;
  if ((requirements.past_due?.length ?? 0) > 0) return true;
  if ((requirements.errors?.length ?? 0) > 0) return true;
  if (requirements.disabled_reason) return true;

  return account.charges_enabled !== true || account.payouts_enabled !== true;
}

export function summarizeStripeConnectActionReason(
  account: Pick<Stripe.Account, "requirements">,
): string | undefined {
  const requirements = account.requirements;
  if (!requirements) return undefined;

  const firstError = requirements.errors?.[0];
  if (firstError?.reason) {
    return firstError.reason;
  }

  if (requirements.disabled_reason) {
    return requirements.disabled_reason;
  }

  const firstDue = requirements.currently_due?.[0] ?? requirements.past_due?.[0];
  if (firstDue) {
    return firstDue;
  }

  return undefined;
}
