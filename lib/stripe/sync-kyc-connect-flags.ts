import type Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";

type AdminSupabaseClient = SupabaseClient<Database>;

export function isStripeConnectAccountId(
  value: string | null | undefined,
): value is string {
  return typeof value === "string" && value.trim().startsWith("acct_");
}

/**
 * Mirror Stripe Connect `charges_enabled` / `payouts_enabled` onto `kyc_records`.
 * Used by webhook `account.updated` and onboarding return URL sync.
 */
export async function syncKycConnectFlagsFromStripeAccount(
  admin: AdminSupabaseClient,
  account: Pick<Stripe.Account, "id" | "charges_enabled" | "payouts_enabled">,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!isStripeConnectAccountId(account.id)) {
    return { ok: false, error: "invalid stripe account id" };
  }

  const { error } = await admin
    .from("kyc_records")
    .update({
      stripe_charges_enabled: account.charges_enabled === true,
      stripe_payouts_enabled: account.payouts_enabled === true,
      updated_at: new Date().toISOString(),
    })
    .eq("stripe_account_id", account.id);

  if (error) {
    console.error("[syncKycConnectFlags] kyc_records update", error.message);
    return { ok: false, error: "db update failed" };
  }

  return { ok: true };
}
