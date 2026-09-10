import { mapProfileRoleToUserType } from "@/lib/admin-user-control/derive-kyc-status";
import {
  formatPlatformUserDateTime,
  formatPlatformUserHandle,
} from "@/lib/admin-user-control/format";
import type {
  PlatformUserKycCounts,
  PlatformUserKycFilter,
  PlatformUserKycStatus,
  PlatformUserPage,
  PlatformUserRow,
  PlatformUserType,
  PlatformUserTypeCounts,
} from "@/lib/admin-user-control/types";
import {
  EMPTY_PLATFORM_USER_KYC_COUNTS,
  PLATFORM_USERS_MAX_PAGE_SIZE,
  PLATFORM_USERS_PAGE_SIZE,
} from "@/lib/admin-user-control/types";
import type { Database } from "@/types/supabase";

type UserRole = Database["public"]["Enums"]["user_role"];

export type PlatformUsersRpcRow = {
  id: string;
  role: UserRole;
  display_name: string;
  username: string | null;
  updated_at: string;
  shop_name: string | null;
  shop_handle: string | null;
  stripe_account_id: string | null;
  application_id: string | null;
  rep_email: string | null;
  ui_kyc_status: PlatformUserKycStatus | string | null;
};

export type PlatformUsersRpcPayload = {
  rows: PlatformUsersRpcRow[];
  total: number;
  page: number;
  page_size: number;
  kyc_counts: PlatformUserKycCounts;
  type_counts: PlatformUserTypeCounts;
};

function parseKycStatus(value: unknown): PlatformUserKycStatus {
  if (value === "verified" || value === "pending" || value === "rejected") {
    return value;
  }
  return null;
}

function parseCountObject(
  value: unknown,
  keys: readonly string[],
): Record<string, number> {
  if (!value || typeof value !== "object") {
    return Object.fromEntries(keys.map((key) => [key, 0]));
  }

  const record = value as Record<string, unknown>;
  return Object.fromEntries(
    keys.map((key) => [
      key,
      typeof record[key] === "number" ? record[key] : Number(record[key] ?? 0),
    ]),
  );
}

function parseRpcRow(value: unknown): PlatformUsersRpcRow | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const row = value as Record<string, unknown>;
  if (typeof row.id !== "string" || typeof row.role !== "string") {
    return null;
  }

  return {
    id: row.id,
    role: row.role as UserRole,
    display_name:
      typeof row.display_name === "string" ? row.display_name : "",
    username: typeof row.username === "string" ? row.username : null,
    updated_at:
      typeof row.updated_at === "string" ? row.updated_at : new Date(0).toISOString(),
    shop_name: typeof row.shop_name === "string" ? row.shop_name : null,
    shop_handle: typeof row.shop_handle === "string" ? row.shop_handle : null,
    stripe_account_id:
      typeof row.stripe_account_id === "string" ? row.stripe_account_id : null,
    application_id:
      typeof row.application_id === "string" ? row.application_id : null,
    rep_email: typeof row.rep_email === "string" ? row.rep_email : null,
    ui_kyc_status: parseKycStatus(row.ui_kyc_status),
  };
}

export function parsePlatformUsersRpcPayload(
  data: unknown,
): PlatformUsersRpcPayload | null {
  if (!data || typeof data !== "object") {
    return null;
  }

  const payload = data as Record<string, unknown>;
  const rawRows = Array.isArray(payload.rows) ? payload.rows : [];
  const rows = rawRows
    .map(parseRpcRow)
    .filter((row): row is PlatformUsersRpcRow => row !== null);

  const kycCountsRaw = parseCountObject(payload.kyc_counts, [
    "all",
    "pending",
    "verified",
    "rejected",
  ]);
  const typeCountsRaw = parseCountObject(payload.type_counts, [
    "member",
    "merchant",
  ]);

  return {
    rows,
    total: typeof payload.total === "number" ? payload.total : Number(payload.total ?? 0),
    page: typeof payload.page === "number" ? payload.page : Number(payload.page ?? 1),
    page_size:
      typeof payload.page_size === "number"
        ? payload.page_size
        : Number(payload.page_size ?? PLATFORM_USERS_PAGE_SIZE),
    kyc_counts: {
      all: kycCountsRaw.all ?? 0,
      pending: kycCountsRaw.pending ?? 0,
      verified: kycCountsRaw.verified ?? 0,
      rejected: kycCountsRaw.rejected ?? 0,
    },
    type_counts: {
      member: typeCountsRaw.member ?? 0,
      merchant: typeCountsRaw.merchant ?? 0,
    },
  };
}

export function mapRpcRowToPlatformUserRow(
  row: PlatformUsersRpcRow,
  email: string,
): PlatformUserRow {
  const userType = mapProfileRoleToUserType(row.role);
  const memberName = row.display_name?.trim() || null;
  const memberHandleRaw = row.username?.trim();
  const memberHandle = memberHandleRaw
    ? memberHandleRaw.startsWith("@")
      ? memberHandleRaw
      : `@${memberHandleRaw}`
    : null;

  if (userType === "merchant") {
    return {
      id: row.id,
      userType,
      name: row.shop_name?.trim() || row.display_name,
      handle: formatPlatformUserHandle(row.username, row.shop_handle),
      memberName,
      memberHandle,
      email,
      stripeAccountId: row.stripe_account_id,
      kycStatus: parseKycStatus(row.ui_kyc_status),
      applicationId: row.application_id,
      updatedAt: formatPlatformUserDateTime(row.updated_at),
      updatedAtIso: row.updated_at,
    };
  }

  return {
    id: row.id,
    userType,
    name: row.display_name,
    handle: formatPlatformUserHandle(row.username, row.shop_handle),
    memberName: null,
    memberHandle: null,
    email,
    stripeAccountId: row.stripe_account_id,
    kycStatus: parseKycStatus(row.ui_kyc_status),
    applicationId: row.application_id,
    updatedAt: formatPlatformUserDateTime(row.updated_at),
    updatedAtIso: row.updated_at,
  };
}

export function resolvePlatformUsersKeyword(
  search: string | undefined,
): string | null {
  const trimmed = search?.trim();
  if (!trimmed) {
    return null;
  }
  return trimmed;
}

export function resolvePlatformUsersPageSize(pageSize?: number): number {
  const size = Math.floor(pageSize ?? PLATFORM_USERS_PAGE_SIZE);
  return Math.min(PLATFORM_USERS_MAX_PAGE_SIZE, Math.max(1, size));
}

export function resolvePlatformUsersPage(page?: number): number {
  return Math.max(1, Math.floor(page ?? 1));
}

export function emptyPlatformUserPage(
  page: number,
  pageSize: number,
): PlatformUserPage {
  return {
    rows: [],
    total: 0,
    page,
    pageSize,
    totalPages: 0,
    kycCounts: { ...EMPTY_PLATFORM_USER_KYC_COUNTS },
    typeCounts: { member: 0, merchant: 0 },
  };
}

export function toPlatformUserPage(
  payload: PlatformUsersRpcPayload,
  rows: PlatformUserRow[],
): PlatformUserPage {
  const total = payload.total;
  const pageSize = payload.page_size;
  const totalPages = total === 0 ? 0 : Math.ceil(total / pageSize);

  return {
    rows,
    total,
    page: payload.page,
    pageSize,
    totalPages,
    kycCounts: payload.kyc_counts,
    typeCounts: payload.type_counts,
  };
}

export function normalizePlatformUserTypes(
  userTypes: PlatformUserType[] | undefined,
): PlatformUserType[] {
  if (!userTypes || userTypes.length === 0) {
    return ["member", "merchant"];
  }
  return [...new Set(userTypes)];
}

export function toRpcKycFilter(filter: PlatformUserKycFilter | undefined): string {
  return filter ?? "all";
}
