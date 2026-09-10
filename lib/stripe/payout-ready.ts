import type { Tables } from "@/types/supabase";

export type MerchantKycPayoutFlags = Pick<
  Tables<"kyc_records">,
  | "kyc_status"
  | "stripe_account_id"
  | "stripe_charges_enabled"
  | "stripe_payouts_enabled"
>;

/** Fail-closed: merchant can receive escrow payouts only when KYC verified + Stripe ready. */
export function isMerchantPayoutReady(
  kyc: MerchantKycPayoutFlags | null | undefined,
): boolean {
  if (!kyc) {
    return false;
  }

  return (
    kyc.kyc_status === "verified" &&
    kyc.stripe_charges_enabled === true &&
    kyc.stripe_payouts_enabled === true
  );
}

type MerchantVerificationRpcClient = {
  rpc(
    fn: "fn_get_merchant_public_verification",
    args: { p_merchant_id: string },
  ): Promise<{ data: unknown; error: { message: string } | null }>;
};

/** Buyer-safe payout gate after DB-H-01 removed direct kyc_records SELECT for non-owners. */
export async function resolveMerchantPayoutReadyForClient(
  supabase: unknown,
  merchantId: string,
): Promise<boolean> {
  const trimmedMerchantId = merchantId.trim();
  if (!trimmedMerchantId) {
    return false;
  }

  const { data, error } = await (
    supabase as unknown as MerchantVerificationRpcClient
  ).rpc("fn_get_merchant_public_verification", {
    p_merchant_id: trimmedMerchantId,
  });

  if (error) {
    console.error("[resolveMerchantPayoutReadyForClient]", error.message);
    return false;
  }

  if (!data || typeof data !== "object") {
    return false;
  }

  const payload = data as Record<string, unknown>;
  return isMerchantPayoutReady({
    kyc_status: payload.kyc_status as MerchantKycPayoutFlags["kyc_status"],
    stripe_account_id: null,
    stripe_charges_enabled: payload.stripe_charges_enabled === true,
    stripe_payouts_enabled: payload.stripe_payouts_enabled === true,
  });
}
