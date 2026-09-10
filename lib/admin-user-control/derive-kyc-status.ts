import type {
  PlatformUserKycStatus,
  PlatformUserType,
} from "@/lib/admin-user-control/types";
import type { Database } from "@/types/supabase";

type UserRole = Database["public"]["Enums"]["user_role"];
type KycApplicationStatus =
  Database["public"]["Enums"]["kyc_application_status"];
type KycRecordStatus = Database["public"]["Enums"]["kyc_state"];

type DeriveKycStatusInput = {
  role: UserRole;
  applicationStatus: KycApplicationStatus | null;
  kycRecordStatus: KycRecordStatus | null;
};

export function mapProfileRoleToUserType(role: UserRole): PlatformUserType {
  return role === "merchant" ? "merchant" : "member";
}

export function derivePlatformUserKycStatus(
  input: DeriveKycStatusInput,
): PlatformUserKycStatus {
  if (input.kycRecordStatus === "verified") {
    return "verified";
  }

  if (input.applicationStatus === "approved") {
    return "verified";
  }

  if (input.applicationStatus === "pending") {
    return "pending";
  }

  if (
    input.applicationStatus === "rejected" ||
    input.kycRecordStatus === "rejected"
  ) {
    return "rejected";
  }

  if (input.kycRecordStatus === "pending") {
    return "pending";
  }

  if (input.role === "member" && !input.applicationStatus) {
    return null;
  }

  if (input.role === "merchant" && !input.applicationStatus) {
    return input.kycRecordStatus === "pending" ? "pending" : null;
  }

  return null;
}

export function matchesPlatformUserKycFilter(
  status: PlatformUserKycStatus,
  filter: "all" | "pending" | "verified" | "rejected",
): boolean {
  if (filter === "all") {
    return true;
  }

  return status === filter;
}
