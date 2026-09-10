export type PlatformUserType = "member" | "merchant";

export type PlatformUserKycStatus =
  | "verified"
  | "pending"
  | "rejected"
  | null;

export type PlatformUserKycFilter =
  | "all"
  | "pending"
  | "verified"
  | "rejected";

export type PlatformUserRow = {
  id: string;
  userType: PlatformUserType;
  name: string;
  handle: string;
  /** Member persona display name — populated for merchant rows. */
  memberName: string | null;
  /** Member persona @handle — populated for merchant rows. */
  memberHandle: string | null;
  email: string;
  stripeAccountId: string | null;
  kycStatus: PlatformUserKycStatus;
  applicationId: string | null;
  updatedAt: string;
  updatedAtIso: string;
};

export type PlatformUserKycCounts = {
  all: number;
  pending: number;
  verified: number;
  rejected: number;
};

export const EMPTY_PLATFORM_USER_KYC_COUNTS: PlatformUserKycCounts = {
  all: 0,
  pending: 0,
  verified: 0,
  rejected: 0,
};

export type PlatformUserTypeCounts = {
  member: number;
  merchant: number;
};

export type PlatformUserPage = {
  rows: PlatformUserRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  kycCounts: PlatformUserKycCounts;
  typeCounts: PlatformUserTypeCounts;
};

export type ListAdminPlatformUsersInput = {
  page?: number;
  pageSize?: number;
  search?: string;
  userTypes?: PlatformUserType[];
  kycFilter?: PlatformUserKycFilter;
};

export type ListAdminPlatformUsersResult =
  | { success: true; data: PlatformUserPage }
  | { success: false; error: string };

export const PLATFORM_USERS_PAGE_SIZE = 10;
export const PLATFORM_USERS_MAX_PAGE_SIZE = 50;
