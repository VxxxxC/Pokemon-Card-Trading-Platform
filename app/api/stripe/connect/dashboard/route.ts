import { NextResponse } from "next/server";
import { getSiteUrl } from "@/lib/auth/site-url";
import { requireActiveApiUser } from "@/lib/auth/require-active-api-user";
import { createMerchantExpressLoginLink } from "@/lib/stripe/connect-dashboard";
import { isMerchantPayoutReady } from "@/lib/stripe/payout-ready";
import { isStripeConnectAccountId } from "@/lib/stripe/sync-kyc-connect-flags";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/types/supabase";

type ProfileRoleRow = Pick<Tables<"profiles">, "role">;

type KycConnectRow = Pick<
  Tables<"kyc_records">,
  | "kyc_status"
  | "stripe_account_id"
  | "stripe_charges_enabled"
  | "stripe_payouts_enabled"
>;

/**
 * Merchant Stripe Express Dashboard login（平台代開一次性 login link）。
 * 未完成 Connect onboarding 時 fallback 至 onboard flow。
 */
export async function GET() {
  const siteUrl = await getSiteUrl();
  const financeFallback = (reason: string) =>
    NextResponse.redirect(`${siteUrl}/profile/merchant/finance?stripe=${reason}`);

  try {
    const auth = await requireActiveApiUser();
    if (!auth.ok) {
      if (auth.status === 401) {
        return NextResponse.redirect(`${siteUrl}/auth`);
      }
      return financeFallback("restricted");
    }
    const { user } = auth;

    const supabase = await createClient();
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle<ProfileRoleRow>();

    if (profile?.role !== "merchant") {
      return NextResponse.redirect(`${siteUrl}/profile/user`);
    }

    const admin = createAdminClient();
    const { data: kycRecord } = await admin
      .from("kyc_records")
      .select(
        "kyc_status, stripe_account_id, stripe_charges_enabled, stripe_payouts_enabled",
      )
      .eq("merchant_id", user.id)
      .maybeSingle<KycConnectRow>();

    const stripeAccountId = isStripeConnectAccountId(kycRecord?.stripe_account_id)
      ? kycRecord.stripe_account_id
      : null;

    if (!stripeAccountId || !isMerchantPayoutReady(kycRecord)) {
      return NextResponse.redirect(`${siteUrl}/api/stripe/connect/onboard`);
    }

    const loginLink = await createMerchantExpressLoginLink(stripeAccountId);
    return NextResponse.redirect(loginLink.url);
  } catch (error) {
    console.error("[stripe/connect/dashboard]", error);
    return financeFallback("error");
  }
}
