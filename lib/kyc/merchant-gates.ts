import type { Database } from "@/types/supabase";

type KycState = Database["public"]["Enums"]["kyc_state"];

/** Merchant-persona listings require admin-approved KYC. */
export function isMerchantListingAllowed(
  kycStatus: KycState | null | undefined,
): boolean {
  return kycStatus === "verified";
}
