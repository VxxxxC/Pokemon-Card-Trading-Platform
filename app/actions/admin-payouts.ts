"use server";

import { getNextBatchSchedule } from "@/lib/admin-payouts/fps-batch-config";
import { isFpsPayoutBlockedForComplete } from "@/lib/admin-payouts/fps-payout-guards";
import { formatAdminDateTime } from "@/lib/admin-payouts/format";
import type {
  AdminPayoutsPageData,
  AdminPayoutsPageResult,
  FpsPayoutPage,
  FpsPayoutRequestStatus,
  FpsPayoutRow,
  FpsPayoutSort,
  FpsPayoutStatusCounts,
  FpsPayoutStatusFilter,
  ListAdminMerchantTransfersInput,
  ListAdminMerchantTransfersResult,
  ListAdminPayoutRequestsInput,
  ListAdminPayoutRequestsExportResult,
  ListAdminPayoutRequestsResult,
  MerchantTransferPage,
  MerchantTransferPayoutStatus,
  MerchantTransferRow,
  MerchantTransferSort,
  MerchantTransferStatusCounts,
  MerchantTransferStatusFilter,
} from "@/lib/admin-payouts/types";
import {
  EMPTY_FPS_PAYOUT_STATUS_COUNTS,
  EMPTY_MERCHANT_TRANSFER_STATUS_COUNTS,
  FPS_EXPORT_CAP,
  FPS_EXPORT_CHUNK_SIZE,
  FPS_INCOMPLETE_STATUSES,
  FPS_PAYOUT_REQUESTS_MAX_PAGE_SIZE,
  FPS_PAYOUT_REQUESTS_PAGE_SIZE,
  FPS_SELLER_NAME_SORT_FETCH_CAP,
  MERCHANT_NAME_SORT_FETCH_CAP,
  MERCHANT_TRANSFERS_EXPORT_CAP,
  MERCHANT_TRANSFERS_MAX_PAGE_SIZE,
  MERCHANT_TRANSFERS_PAGE_SIZE,
} from "@/lib/admin-payouts/types";
import { isCurrentUserAdmin } from "@/lib/auth/require-admin";
import { getOptionalAuthUser } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { executeMerchantConnectPayout } from "@/lib/merchant-order/execute-connect-payout";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import { getPlatformStripeBalance } from "@/lib/stripe/platform-balance";
import { getPlatformStripeTodayInflow } from "@/lib/stripe/platform-today-inflow";
import type { Tables } from "@/types/supabase";
import { revalidatePath } from "next/cache";

type MerchantOrderRow = Pick<
  Tables<"merchant_orders">,
  | "id"
  | "order_number"
  | "merchant_id"
  | "stripe_transfer_id"
  | "stripe_destination_account_id"
  | "merchant_payout_amount"
  | "commission_amount"
  | "commission_rate_applied"
  | "item_subtotal"
  | "auth_fee"
  | "buyer_confirmed_at"
  | "payout_hold_until"
  | "stripe_payment_intent_id"
  | "requires_authentication"
  | "transferred_at"
  | "payout_status"
  | "payout_error"
>;

const MERCHANT_ORDER_SELECT =
  "id, order_number, merchant_id, stripe_transfer_id, stripe_destination_account_id, merchant_payout_amount, commission_amount, commission_rate_applied, item_subtotal, auth_fee, buyer_confirmed_at, payout_hold_until, stripe_payment_intent_id, requires_authentication, transferred_at, payout_status, payout_error";

async function requireAdmin(): Promise<
  { ok: true; adminId: string } | { ok: false; error: string }
> {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: "未登入" };
  }

  const user = await getOptionalAuthUser();
  if (!user) {
    return { ok: false, error: "請先登入" };
  }

  const supabase = await createClient();
  const isAdmin = await isCurrentUserAdmin(supabase, user.id);
  if (!isAdmin) {
    return { ok: false, error: "無管理員權限" };
  }

  return { ok: true, adminId: user.id };
}

function normalizePayoutStatus(status: string | null): MerchantTransferPayoutStatus {
  if (
    status === "pending" ||
    status === "held" ||
    status === "processing" ||
    status === "paid" ||
    status === "failed" ||
    status === "frozen"
  ) {
    return status;
  }
  return "pending";
}

function resolvePageSize(pageSize?: number): number {
  const size = Math.floor(pageSize ?? MERCHANT_TRANSFERS_PAGE_SIZE);
  return Math.min(
    MERCHANT_TRANSFERS_MAX_PAGE_SIZE,
    Math.max(1, size),
  );
}

function resolvePage(page?: number): number {
  return Math.max(1, Math.floor(page ?? 1));
}

function isMerchantNameSort(
  sort: MerchantTransferSort | undefined,
): sort is "merchantName-asc" | "merchantName-desc" {
  return sort === "merchantName-asc" || sort === "merchantName-desc";
}

async function resolveSearchMerchantIds(
  admin: ReturnType<typeof createAdminClient>,
  search: string,
): Promise<string[]> {
  const term = search.trim();
  if (!term) {
    return [];
  }

  const { data } = await admin
    .from("merchant_shops")
    .select("merchant_id")
    .ilike("shop_name", `%${term}%`);

  return (data ?? [])
    .map((row) => row.merchant_id)
    .filter((id): id is string => Boolean(id));
}

function applyMerchantTransferFilters<T extends {
  eq: (column: string, value: string) => T;
  gte: (column: string, value: string) => T;
  lte: (column: string, value: string) => T;
  or: (filters: string) => T;
}>(
  query: T,
  input: ListAdminMerchantTransfersInput,
  searchMerchantIds: string[],
): T {
  let filtered = query.or(
    "stripe_transfer_id.not.is.null,buyer_confirmed_at.not.is.null",
  );

  if (input.statusFilter && input.statusFilter !== "all") {
    filtered = filtered.eq("payout_status", input.statusFilter);
  }

  if (input.dateFrom) {
    filtered = filtered.or(
      `and(transferred_at.gte.${input.dateFrom},transferred_at.not.is.null),and(buyer_confirmed_at.gte.${input.dateFrom},transferred_at.is.null)`,
    );
  }

  if (input.dateTo) {
    filtered = filtered.or(
      `and(transferred_at.lte.${input.dateTo},transferred_at.not.is.null),and(buyer_confirmed_at.lte.${input.dateTo},transferred_at.is.null)`,
    );
  }

  const search = input.search?.trim();
  if (search) {
    const escaped = search.replace(/[%_,]/g, "");
    const orParts = [
      `order_number.ilike.%${escaped}%`,
      `stripe_transfer_id.ilike.%${escaped}%`,
    ];
    if (searchMerchantIds.length > 0) {
      orParts.push(`merchant_id.in.(${searchMerchantIds.join(",")})`);
    }
    filtered = filtered.or(orParts.join(","));
  }

  return filtered;
}

async function enrichMerchantTransferRows(
  orders: MerchantOrderRow[],
): Promise<MerchantTransferRow[]> {
  if (orders.length === 0) {
    return [];
  }

  const admin = createAdminClient();
  const merchantIds = [
    ...new Set(
      orders
        .map((order) => order.merchant_id)
        .filter((id): id is string => Boolean(id)),
    ),
  ];

  const shopNameByMerchantId = new Map<string, string>();
  const stripeAccountByMerchantId = new Map<string, string>();
  const displayNameByMerchantId = new Map<string, string>();

  if (merchantIds.length > 0) {
    const [{ data: shops }, { data: kycRows }, { data: profiles }] =
      await Promise.all([
        admin
          .from("merchant_shops")
          .select("merchant_id, shop_name")
          .in("merchant_id", merchantIds),
        admin
          .from("kyc_records")
          .select("merchant_id, stripe_account_id")
          .in("merchant_id", merchantIds),
        admin
          .from("profiles")
          .select("id, display_name")
          .in("id", merchantIds),
      ]);

    for (const shop of shops ?? []) {
      if (shop.shop_name) {
        shopNameByMerchantId.set(shop.merchant_id, shop.shop_name);
      }
    }

    for (const kyc of kycRows ?? []) {
      if (kyc.stripe_account_id) {
        stripeAccountByMerchantId.set(kyc.merchant_id, kyc.stripe_account_id);
      }
    }

    for (const profile of profiles ?? []) {
      displayNameByMerchantId.set(profile.id, profile.display_name);
    }
  }

  const orderIds = orders.map((order) => order.id);
  const ledgerAmountByOrderId = new Map<string, number>();

  if (orderIds.length > 0) {
    const { data: ledgerRows } = await admin
      .from("merchant_ledgers")
      .select("order_id, amount, transaction_type")
      .in("order_id", orderIds)
      .eq("transaction_type", "payout");

    for (const ledger of ledgerRows ?? []) {
      if (ledger.order_id) {
        ledgerAmountByOrderId.set(ledger.order_id, Number(ledger.amount));
      }
    }
  }

  return orders.map((order) => {
    const merchantName =
      shopNameByMerchantId.get(order.merchant_id) ??
      displayNameByMerchantId.get(order.merchant_id) ??
      "未知商戶";

    const subAccountId =
      order.stripe_destination_account_id ??
      stripeAccountByMerchantId.get(order.merchant_id) ??
      "—";

    const merchantPayoutAmount = Number(order.merchant_payout_amount ?? 0);
    const ledgerAmount = ledgerAmountByOrderId.get(order.id);
    let reconciliationWarning: string | undefined;

    if (
      ledgerAmount !== undefined &&
      Math.abs(ledgerAmount - merchantPayoutAmount) > 0.01
    ) {
      reconciliationWarning = `Ledger payout HK$${ledgerAmount} ≠ 訂單 HK$${merchantPayoutAmount}`;
      console.warn(
        "[listAdminMerchantTransfers] reconciliation mismatch",
        order.id,
        reconciliationWarning,
      );
    }

    const transferredAtIso = order.transferred_at;
    const transferredAtLabel = formatAdminDateTime(transferredAtIso);
    const payoutHoldUntilIso = order.payout_hold_until;
    const payoutHoldUntilLabel = formatAdminDateTime(payoutHoldUntilIso);

    return {
      orderId: order.id,
      orderNumber: order.order_number ?? order.id.slice(0, 8),
      merchantId: order.merchant_id,
      stripeTransferId: order.stripe_transfer_id ?? "—",
      merchantName,
      subAccountId,
      requiresAuthentication: Boolean(order.requires_authentication),
      itemSubtotal: Number(order.item_subtotal ?? 0),
      commissionRateApplied:
        order.commission_rate_applied !== null &&
        order.commission_rate_applied !== undefined
          ? Number(order.commission_rate_applied)
          : null,
      platformCommission: Number(order.commission_amount ?? 0),
      authFee: Number(order.auth_fee ?? 0),
      merchantPayoutAmount,
      payoutStatus: normalizePayoutStatus(order.payout_status),
      payoutError: order.payout_error,
      reconciliationWarning,
      buyerConfirmedAt: formatAdminDateTime(order.buyer_confirmed_at),
      buyerConfirmedAtIso: order.buyer_confirmed_at,
      payoutHoldUntil: payoutHoldUntilLabel,
      payoutHoldUntilIso: payoutHoldUntilIso,
      stripePaymentIntentId: order.stripe_payment_intent_id,
      transferredAt: transferredAtLabel,
      transferredAtIso,
      createdAt: transferredAtLabel,
    };
  });
}

function getMerchantTransferSortMs(row: MerchantTransferRow): number {
  if (row.transferredAtIso) {
    return new Date(row.transferredAtIso).getTime();
  }

  if (row.payoutHoldUntilIso) {
    return new Date(row.payoutHoldUntilIso).getTime();
  }

  if (row.buyerConfirmedAtIso) {
    return new Date(row.buyerConfirmedAtIso).getTime();
  }

  return 0;
}

function sortMerchantTransferRows(
  rows: MerchantTransferRow[],
  sort: MerchantTransferSort | undefined,
): MerchantTransferRow[] {
  if (!sort || sort === "transferred_at-desc") {
    return [...rows].sort(
      (a, b) => getMerchantTransferSortMs(b) - getMerchantTransferSortMs(a),
    );
  }

  if (sort === "transferred_at-asc") {
    return [...rows].sort(
      (a, b) => getMerchantTransferSortMs(a) - getMerchantTransferSortMs(b),
    );
  }

  if (sort === "merchantName-asc") {
    return [...rows].sort((a, b) =>
      a.merchantName.localeCompare(b.merchantName, "zh-HK"),
    );
  }

  return [...rows].sort((a, b) =>
    b.merchantName.localeCompare(a.merchantName, "zh-HK"),
  );
}

async function fetchMerchantTransferStatusCounts(
  input: ListAdminMerchantTransfersInput,
  searchMerchantIds: string[],
): Promise<MerchantTransferStatusCounts> {
  const admin = createAdminClient();
  const baseInput = { ...input, statusFilter: undefined };

  const countWithStatus = async (
    statusFilter: MerchantTransferStatusFilter,
  ): Promise<number> => {
    const query = applyMerchantTransferFilters(
      admin.from("merchant_orders").select("*", { count: "exact", head: true }),
      { ...baseInput, statusFilter },
      searchMerchantIds,
    );

    const { count, error } = await query;
    if (error) {
      console.error(
        "[fetchMerchantTransferStatusCounts]",
        statusFilter,
        error,
      );
      return 0;
    }
    return count ?? 0;
  };

  const [all, paid, processing, pending, failed, held, frozen] = await Promise.all([
    countWithStatus("all"),
    countWithStatus("paid"),
    countWithStatus("processing"),
    countWithStatus("pending"),
    countWithStatus("failed"),
    countWithStatus("held"),
    countWithStatus("frozen"),
  ]);

  return { all, paid, processing, pending, failed, held, frozen };
}

function emptyMerchantTransferPage(
  page: number,
  pageSize: number,
): MerchantTransferPage {
  return {
    rows: [],
    total: 0,
    page,
    pageSize,
    totalPages: 0,
    statusCounts: { ...EMPTY_MERCHANT_TRANSFER_STATUS_COUNTS },
  };
}

async function fetchMerchantTransferPage(
  input: ListAdminMerchantTransfersInput,
): Promise<MerchantTransferPage> {
  const admin = createAdminClient();
  const page = resolvePage(input.page);
  const pageSize = resolvePageSize(input.pageSize);
  const sort = input.sort ?? "transferred_at-desc";
  const searchMerchantIds = input.search
    ? await resolveSearchMerchantIds(admin, input.search)
    : [];

  const statusCountsPromise = fetchMerchantTransferStatusCounts(
    input,
    searchMerchantIds,
  );

  if (isMerchantNameSort(sort)) {
    const baseQuery = applyMerchantTransferFilters(
      admin.from("merchant_orders").select(MERCHANT_ORDER_SELECT),
      input,
      searchMerchantIds,
    );

    const { data: orders, error } = await baseQuery.limit(
      MERCHANT_NAME_SORT_FETCH_CAP,
    );

    if (error || !orders) {
      console.error("[listAdminMerchantTransfers] merchant name sort", error);
      return emptyMerchantTransferPage(page, pageSize);
    }

    const [enriched, statusCounts] = await Promise.all([
      enrichMerchantTransferRows(orders as MerchantOrderRow[]),
      statusCountsPromise,
    ]);
    const sorted = sortMerchantTransferRows(enriched, sort);
    const total = sorted.length;
    const totalPages = total === 0 ? 0 : Math.ceil(total / pageSize);
    const safePage = totalPages === 0 ? 1 : Math.min(page, totalPages);
    const offset = (safePage - 1) * pageSize;

    return {
      rows: sorted.slice(offset, offset + pageSize),
      total,
      page: safePage,
      pageSize,
      totalPages,
      statusCounts,
    };
  }

  const offset = (page - 1) * pageSize;
  const ascending = sort === "transferred_at-asc";

  let listQuery = applyMerchantTransferFilters(
    admin.from("merchant_orders").select(MERCHANT_ORDER_SELECT, {
      count: "exact",
    }),
    input,
    searchMerchantIds,
  );

  if (input.statusFilter === "held") {
    listQuery = listQuery.order("payout_hold_until", { ascending });
  } else {
    listQuery = listQuery
      .order("transferred_at", { ascending, nullsFirst: ascending })
      .order("buyer_confirmed_at", { ascending: !ascending });
  }

  listQuery = listQuery.range(offset, offset + pageSize - 1);

  const [{ data: orders, count, error }, statusCounts] = await Promise.all([
    listQuery,
    statusCountsPromise,
  ]);

  if (error || !orders) {
    console.error("[listAdminMerchantTransfers] merchant_orders", error);
    return emptyMerchantTransferPage(page, pageSize);
  }

  const total = count ?? 0;
  const totalPages = total === 0 ? 0 : Math.ceil(total / pageSize);
  const rows = await enrichMerchantTransferRows(orders as MerchantOrderRow[]);

  return {
    rows,
    total,
    page,
    pageSize,
    totalPages,
    statusCounts,
  };
}

export async function listAdminMerchantTransfers(
  input: ListAdminMerchantTransfersInput = {},
): Promise<ListAdminMerchantTransfersResult> {
  const guard = await requireAdmin();
  if (!guard.ok) {
    return { success: false, error: guard.error };
  }

  try {
    const data = await fetchMerchantTransferPage({
      ...input,
      page: resolvePage(input.page),
      pageSize: resolvePageSize(input.pageSize),
      sort: input.sort ?? "transferred_at-desc",
    });
    return { success: true, data };
  } catch (error) {
    console.error("[listAdminMerchantTransfers]", error);
    return { success: false, error: "無法載入商戶流水" };
  }
}

export async function listAdminMerchantTransfersForExport(
  input: Omit<ListAdminMerchantTransfersInput, "page" | "pageSize">,
): Promise<ListAdminMerchantTransfersResult> {
  const guard = await requireAdmin();
  if (!guard.ok) {
    return { success: false, error: guard.error };
  }

  try {
    const firstPage = await fetchMerchantTransferPage({
      ...input,
      page: 1,
      pageSize: 1,
    });

    const exportSize = Math.min(
      firstPage.total,
      MERCHANT_TRANSFERS_EXPORT_CAP,
    );

    if (exportSize === 0) {
      return {
        success: true,
        data: emptyMerchantTransferPage(1, MERCHANT_TRANSFERS_PAGE_SIZE),
      };
    }

    const data = await fetchMerchantTransferPage({
      ...input,
      page: 1,
      pageSize: exportSize,
    });

    return { success: true, data };
  } catch (error) {
    console.error("[listAdminMerchantTransfersForExport]", error);
    return { success: false, error: "無法導出商戶流水" };
  }
}

async function buildStripeBalanceSection(): Promise<{
  stripeBalance: AdminPayoutsPageData["stripeBalance"];
  stripeBalanceError?: string;
}> {
  const [balanceResult, todayInResult] = await Promise.all([
    getPlatformStripeBalance(),
    getPlatformStripeTodayInflow(),
  ]);

  if (!balanceResult.ok) {
    return {
      stripeBalance: null,
      stripeBalanceError: balanceResult.error,
    };
  }

  const errors: string[] = [];
  if (!todayInResult.ok && todayInResult.error) {
    errors.push(todayInResult.error);
  }

  return {
    stripeBalance: {
      available: balanceResult.data.available,
      pending: balanceResult.data.pending,
      todayIn: todayInResult.todayIn,
      currency: "HKD",
      lastSyncedAt: balanceResult.data.lastSyncedAt,
    },
    stripeBalanceError: errors.length > 0 ? errors.join("；") : undefined,
  };
}

export async function getAdminPayoutsPageData(): Promise<AdminPayoutsPageResult> {
  const guard = await requireAdmin();
  if (!guard.ok) {
    return { success: false, error: guard.error };
  }

  try {
    const stripeSection = await buildStripeBalanceSection();

    return {
      success: true,
      data: {
        stripeBalance: stripeSection.stripeBalance,
        stripeBalanceError: stripeSection.stripeBalanceError,
      },
    };
  } catch (error) {
    console.error("[getAdminPayoutsPageData]", error);
    return { success: false, error: "無法載入財務資料" };
  }
}

export async function refreshAdminStripeBalance(): Promise<
  { success: true } | { success: false; error: string }
> {
  const guard = await requireAdmin();
  if (!guard.ok) {
    return { success: false, error: guard.error };
  }

  revalidatePath("/admin/payouts");
  return { success: true };
}

export async function getAdminFpsBatchSchedule() {
  return getNextBatchSchedule();
}

type PayoutRequestRow = Pick<
  Tables<"payout_requests">,
  | "id"
  | "order_id"
  | "seller_id"
  | "amount"
  | "gross_payout_hkd"
  | "fps_transfer_fee_hkd"
  | "fps_id_snapshot"
  | "fps_name_snapshot"
  | "status"
  | "ready_at"
  | "created_at"
  | "admin_fps_reference"
  | "paid_at"
>;

const PAYOUT_REQUEST_SELECT =
  "id, order_id, seller_id, amount, gross_payout_hkd, fps_transfer_fee_hkd, fps_id_snapshot, fps_name_snapshot, status, ready_at, created_at, admin_fps_reference, paid_at";

function normalizeFpsPayoutStatus(
  status: string | null,
): FpsPayoutRequestStatus {
  if (
    status === "pending" ||
    status === "ready" ||
    status === "processing" ||
    status === "completed" ||
    status === "failed"
  ) {
    return status;
  }
  return "pending";
}

function resolveFpsPageSize(
  pageSize?: number,
  maxPageSize = FPS_PAYOUT_REQUESTS_MAX_PAGE_SIZE,
): number {
  const size = Math.floor(pageSize ?? FPS_PAYOUT_REQUESTS_PAGE_SIZE);
  return Math.min(maxPageSize, Math.max(1, size));
}

function isFpsSellerNameSort(
  sort: FpsPayoutSort | undefined,
): sort is "userName-asc" | "userName-desc" {
  return sort === "userName-asc" || sort === "userName-desc";
}

function escapeFpsSearchTerm(search: string): string {
  return search.trim().replace(/[%_,]/g, "");
}

function normalizeFpsRequestIdSearchTerm(search: string): string {
  return escapeFpsSearchTerm(search).replace(/^#+/, "");
}

function formatPostgrestInFilter(column: string, ids: string[]): string | null {
  if (ids.length === 0) {
    return null;
  }
  const quoted = ids.map((id) => `"${id}"`).join(",");
  return `${column}.in.(${quoted})`;
}

class FpsPayoutQueryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FpsPayoutQueryError";
  }
}

async function resolveSearchRequestIds(
  admin: ReturnType<typeof createAdminClient>,
  search: string,
): Promise<string[]> {
  const term = normalizeFpsRequestIdSearchTerm(search);
  if (!term) {
    return [];
  }

  const fullUuidPattern =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (fullUuidPattern.test(term)) {
    const { data, error } = await admin
      .from("payout_requests")
      .select("id")
      .eq("id", term)
      .limit(1);

    if (error) {
      console.error("[resolveSearchRequestIds]", error);
      throw new FpsPayoutQueryError("無法搜尋提現單號");
    }

    return (data ?? []).map((row) => row.id);
  }

  const { data, error } = await admin
    .from("payout_requests")
    .select("id")
    .filter("id::text", "ilike", `%${term}%`)
    .limit(50);

  if (error) {
    console.error("[resolveSearchRequestIds]", error);
    throw new FpsPayoutQueryError("無法搜尋提現單號");
  }

  return (data ?? []).map((row) => row.id);
}

async function resolveSearchOrderIds(
  admin: ReturnType<typeof createAdminClient>,
  search: string,
): Promise<string[]> {
  const term = escapeFpsSearchTerm(search);
  if (!term) {
    return [];
  }

  const { data } = await admin
    .from("member_orders")
    .select("id")
    .ilike("order_number", `%${term}%`);

  return (data ?? []).map((row) => row.id).filter((id): id is string => Boolean(id));
}

async function resolveSearchSellerIds(
  admin: ReturnType<typeof createAdminClient>,
  search: string,
): Promise<string[]> {
  const term = escapeFpsSearchTerm(search);
  if (!term) {
    return [];
  }

  const { data } = await admin
    .from("profiles")
    .select("id")
    .or(`display_name.ilike.%${term}%,username.ilike.%${term}%`);

  return (data ?? []).map((row) => row.id).filter((id): id is string => Boolean(id));
}

function applyFpsPayoutFilters<T extends {
  eq: (column: string, value: string) => T;
  gte: (column: string, value: string) => T;
  lte: (column: string, value: string) => T;
  in: (column: string, values: string[]) => T;
  or: (filters: string) => T;
}>(
  query: T,
  input: ListAdminPayoutRequestsInput,
  searchOrderIds: string[],
  searchSellerIds: string[],
  searchRequestIds: string[],
): T {
  let filtered = query;

  if (input.statusFilter && input.statusFilter !== "all") {
    if (input.statusFilter === "incomplete") {
      filtered = filtered.in("status", [...FPS_INCOMPLETE_STATUSES]);
    } else {
      filtered = filtered.eq("status", input.statusFilter);
    }
  }

  if (input.dateFrom) {
    filtered = filtered.gte("created_at", input.dateFrom);
  }

  if (input.dateTo) {
    filtered = filtered.lte("created_at", input.dateTo);
  }

  const search = input.search?.trim();
  if (search) {
    const escaped = escapeFpsSearchTerm(search);
    const orParts = [
      `fps_id_snapshot.ilike.%${escaped}%`,
      `fps_name_snapshot.ilike.%${escaped}%`,
      `admin_fps_reference.ilike.%${escaped}%`,
    ];

    const requestIdIn = formatPostgrestInFilter("id", searchRequestIds);
    if (requestIdIn) {
      orParts.push(requestIdIn);
    }
    const orderIdIn = formatPostgrestInFilter("order_id", searchOrderIds);
    if (orderIdIn) {
      orParts.push(orderIdIn);
    }
    const sellerIdIn = formatPostgrestInFilter("seller_id", searchSellerIds);
    if (sellerIdIn) {
      orParts.push(sellerIdIn);
    }

    filtered = filtered.or(orParts.join(","));
  }

  return filtered;
}

async function enrichFpsPayoutRows(
  requests: PayoutRequestRow[],
): Promise<FpsPayoutRow[]> {
  if (requests.length === 0) {
    return [];
  }

  const admin = createAdminClient();
  const orderIds = [...new Set(requests.map((row) => row.order_id))];
  const sellerIds = [...new Set(requests.map((row) => row.seller_id))];

  const [{ data: orders }, { data: profiles }] = await Promise.all([
    admin.from("member_orders").select("id, order_number").in("id", orderIds),
    admin
      .from("profiles")
      .select("id, display_name, username")
      .in("id", sellerIds),
  ]);

  const orderNumberById = new Map<string, string>();
  for (const order of orders ?? []) {
    orderNumberById.set(order.id, order.order_number ?? order.id.slice(0, 8));
  }

  const sellerNameById = new Map<string, string>();
  for (const profile of profiles ?? []) {
    sellerNameById.set(
      profile.id,
      profile.display_name || profile.username || "未知用戶",
    );
  }

  return requests.map((request) => {
    const submittedAtIso = request.ready_at ?? request.created_at;
    return {
      requestId: request.id,
      orderId: request.order_id,
      orderNumber:
        orderNumberById.get(request.order_id) ??
        request.order_id.slice(0, 8),
      sellerId: request.seller_id,
      sellerName: sellerNameById.get(request.seller_id) ?? "未知用戶",
      amount: Number(request.amount ?? 0),
      grossPayoutHkd: Number(
        request.gross_payout_hkd ?? request.amount ?? 0,
      ),
      fpsTransferFeeHkd: Number(request.fps_transfer_fee_hkd ?? 0),
      fpsId: request.fps_id_snapshot,
      fpsName: request.fps_name_snapshot,
      status: normalizeFpsPayoutStatus(request.status),
      submittedAt: formatAdminDateTime(submittedAtIso),
      submittedAtIso,
      adminFpsReference: request.admin_fps_reference,
      paidAt: request.paid_at ? formatAdminDateTime(request.paid_at) : null,
    };
  });
}

function sortFpsPayoutRows(
  rows: FpsPayoutRow[],
  sort: FpsPayoutSort | undefined,
): FpsPayoutRow[] {
  const effectiveSort = sort ?? "submittedAt-desc";

  if (effectiveSort === "submittedAt-desc") {
    return [...rows].sort((a, b) => {
      const aMs = a.submittedAtIso ? new Date(a.submittedAtIso).getTime() : 0;
      const bMs = b.submittedAtIso ? new Date(b.submittedAtIso).getTime() : 0;
      return bMs - aMs;
    });
  }

  if (effectiveSort === "submittedAt-asc") {
    return [...rows].sort((a, b) => {
      const aMs = a.submittedAtIso ? new Date(a.submittedAtIso).getTime() : 0;
      const bMs = b.submittedAtIso ? new Date(b.submittedAtIso).getTime() : 0;
      return aMs - bMs;
    });
  }

  if (effectiveSort === "userName-asc") {
    return [...rows].sort((a, b) =>
      a.sellerName.localeCompare(b.sellerName, "zh-HK"),
    );
  }

  return [...rows].sort((a, b) =>
    b.sellerName.localeCompare(a.sellerName, "zh-HK"),
  );
}

async function fetchFpsPayoutStatusCounts(
  input: ListAdminPayoutRequestsInput,
  searchOrderIds: string[],
  searchSellerIds: string[],
  searchRequestIds: string[],
): Promise<FpsPayoutStatusCounts> {
  const admin = createAdminClient();
  const baseInput = { ...input, statusFilter: undefined };

  const countWithFilter = async (
    statusFilter: FpsPayoutStatusFilter,
  ): Promise<number> => {
    const query = applyFpsPayoutFilters(
      admin.from("payout_requests").select("*", { count: "exact", head: true }),
      { ...baseInput, statusFilter },
      searchOrderIds,
      searchSellerIds,
      searchRequestIds,
    );

    const { count, error } = await query;
    if (error) {
      console.error("[fetchFpsPayoutStatusCounts]", statusFilter, error);
      throw new FpsPayoutQueryError("無法載入 FPS 狀態統計");
    }
    return count ?? 0;
  };

  const [all, incomplete, completed, failed] = await Promise.all([
    countWithFilter("all"),
    countWithFilter("incomplete"),
    countWithFilter("completed"),
    countWithFilter("failed"),
  ]);

  return { all, incomplete, completed, failed };
}

function emptyFpsPayoutPage(page: number, pageSize: number): FpsPayoutPage {
  return {
    rows: [],
    total: 0,
    page,
    pageSize,
    totalPages: 0,
    statusCounts: { ...EMPTY_FPS_PAYOUT_STATUS_COUNTS },
  };
}

async function fetchFpsPayoutPage(
  input: ListAdminPayoutRequestsInput,
): Promise<FpsPayoutPage> {
  const admin = createAdminClient();
  const page = resolvePage(input.page);
  const pageSize = resolveFpsPageSize(
    input.pageSize,
    input.maxPageSize ?? FPS_PAYOUT_REQUESTS_MAX_PAGE_SIZE,
  );
  const sort = input.sort ?? "submittedAt-desc";
  const search = input.search?.trim();

  const [searchOrderIds, searchSellerIds, searchRequestIds] = search
    ? await Promise.all([
        resolveSearchOrderIds(admin, search),
        resolveSearchSellerIds(admin, search),
        resolveSearchRequestIds(admin, search),
      ])
    : [[], [], []];

  const statusCountsPromise = fetchFpsPayoutStatusCounts(
    input,
    searchOrderIds,
    searchSellerIds,
    searchRequestIds,
  );

  if (isFpsSellerNameSort(sort)) {
    const baseQuery = applyFpsPayoutFilters(
      admin.from("payout_requests").select(PAYOUT_REQUEST_SELECT),
      input,
      searchOrderIds,
      searchSellerIds,
      searchRequestIds,
    );

    const { data: requests, error } = await baseQuery.limit(
      FPS_SELLER_NAME_SORT_FETCH_CAP,
    );

    if (error) {
      console.error("[listAdminPayoutRequests] seller name sort", error);
      throw new FpsPayoutQueryError("無法搜尋或載入 FPS 提現單");
    }

    if (!requests) {
      throw new FpsPayoutQueryError("無法搜尋或載入 FPS 提現單");
    }

    const [enriched, statusCounts] = await Promise.all([
      enrichFpsPayoutRows(requests as PayoutRequestRow[]),
      statusCountsPromise,
    ]);
    const sorted = sortFpsPayoutRows(enriched, sort);
    const total = sorted.length;
    const totalPages = total === 0 ? 0 : Math.ceil(total / pageSize);
    const safePage = totalPages === 0 ? 1 : Math.min(page, totalPages);
    const offset = (safePage - 1) * pageSize;

    return {
      rows: sorted.slice(offset, offset + pageSize),
      total,
      page: safePage,
      pageSize,
      totalPages,
      statusCounts,
    };
  }

  const offset = (page - 1) * pageSize;
  const ascending = sort === "submittedAt-asc";

  const listQuery = applyFpsPayoutFilters(
    admin.from("payout_requests").select(PAYOUT_REQUEST_SELECT, {
      count: "exact",
    }),
    input,
    searchOrderIds,
    searchSellerIds,
    searchRequestIds,
  )
    .order("ready_at", { ascending, nullsFirst: false })
    .order("created_at", { ascending, nullsFirst: false })
    .range(offset, offset + pageSize - 1);

  const [{ data: requests, count, error }, statusCounts] = await Promise.all([
    listQuery,
    statusCountsPromise,
  ]);

  if (error) {
    console.error("[listAdminPayoutRequests] payout_requests", error);
    throw new FpsPayoutQueryError("無法搜尋或載入 FPS 提現單");
  }

  if (!requests) {
    throw new FpsPayoutQueryError("無法搜尋或載入 FPS 提現單");
  }

  const total = count ?? 0;
  const totalPages = total === 0 ? 0 : Math.ceil(total / pageSize);
  const rows = await enrichFpsPayoutRows(requests as PayoutRequestRow[]);

  return {
    rows,
    total,
    page,
    pageSize,
    totalPages,
    statusCounts,
  };
}

export async function listAdminPayoutRequests(
  input: ListAdminPayoutRequestsInput = {},
): Promise<ListAdminPayoutRequestsResult> {
  const guard = await requireAdmin();
  if (!guard.ok) {
    return { success: false, error: guard.error };
  }

  try {
    const data = await fetchFpsPayoutPage({
      ...input,
      page: resolvePage(input.page),
      pageSize: resolveFpsPageSize(input.pageSize),
      sort: input.sort ?? "submittedAt-desc",
    });
    return { success: true, data };
  } catch (error) {
    if (error instanceof FpsPayoutQueryError) {
      return { success: false, error: error.message };
    }
    console.error("[listAdminPayoutRequests]", error);
    return { success: false, error: "無法載入 FPS 提現單" };
  }
}

export async function listAdminPayoutRequestsForExport(
  input: Omit<ListAdminPayoutRequestsInput, "page" | "pageSize" | "maxPageSize">,
): Promise<ListAdminPayoutRequestsExportResult> {
  const guard = await requireAdmin();
  if (!guard.ok) {
    return { success: false, error: guard.error };
  }

  try {
    const firstPage = await fetchFpsPayoutPage({
      ...input,
      page: 1,
      pageSize: 1,
    });

    const totalMatching = firstPage.total;
    if (totalMatching === 0) {
      return {
        success: true,
        data: {
          rows: [],
          totalMatching: 0,
          exportedCount: 0,
          exportCap: FPS_EXPORT_CAP,
          capped: false,
        },
      };
    }

    const exportTarget = Math.min(totalMatching, FPS_EXPORT_CAP);
    const rows: FpsPayoutRow[] = [];
    let fetched = 0;
    let page = 1;

    while (fetched < exportTarget) {
      const chunkSize = Math.min(
        FPS_EXPORT_CHUNK_SIZE,
        exportTarget - fetched,
      );
      const data = await fetchFpsPayoutPage({
        ...input,
        page,
        pageSize: chunkSize,
        maxPageSize: FPS_EXPORT_CHUNK_SIZE,
      });

      if (data.rows.length === 0) {
        break;
      }

      rows.push(...data.rows);
      fetched += data.rows.length;

      if (data.rows.length < chunkSize) {
        break;
      }

      page += 1;
    }

    return {
      success: true,
      data: {
        rows,
        totalMatching,
        exportedCount: rows.length,
        exportCap: FPS_EXPORT_CAP,
        capped: totalMatching > FPS_EXPORT_CAP,
      },
    };
  } catch (error) {
    if (error instanceof FpsPayoutQueryError) {
      return { success: false, error: error.message };
    }
    console.error("[listAdminPayoutRequestsForExport]", error);
    return { success: false, error: "無法導出 FPS 提現單" };
  }
}

export async function updateAdminPayoutRequestStatus(input: {
  requestId: string;
  status: "completed" | "failed";
  adminFpsReference?: string;
}): Promise<{ success: true } | { success: false; error: string }> {
  const guard = await requireAdmin();
  if (!guard.ok) {
    return { success: false, error: guard.error };
  }

  if (input.status === "completed" && !input.adminFpsReference?.trim()) {
    return { success: false, error: "請填寫 FPS 轉帳參考號" };
  }

  const admin = createAdminClient();

  const { data, error } = await admin.rpc(
    "rpc_admin_set_fps_payout_request_status",
    {
      p_request_id: input.requestId,
      p_status: input.status,
      p_admin_id: guard.adminId,
      p_admin_fps_reference: input.adminFpsReference?.trim() || undefined,
    },
  );

  if (error) {
    console.error("[updateAdminPayoutRequestStatus]", error);
    return {
      success: false,
      error: error.message || "無法更新提現單狀態",
    };
  }

  const payload = data as {
    order_number?: string | null;
  } | null;

  revalidatePath("/admin/payouts");
  if (payload?.order_number) {
    revalidatePath(`/profile/user/orderDetail/${payload.order_number}`);
  }

  return { success: true };
}

export async function batchCompleteAdminPayoutRequests(input: {
  requestIds: string[];
}): Promise<
  | { success: true; completedCount: number }
  | { success: false; error: string }
> {
  const guard = await requireAdmin();
  if (!guard.ok) {
    return { success: false, error: guard.error };
  }

  const requestIds = [...new Set(input.requestIds.filter(Boolean))];
  if (requestIds.length === 0) {
    return { success: false, error: "請選擇至少一筆提現單" };
  }

  const admin = createAdminClient();

  const { data: rows, error: fetchError } = await admin
    .from("payout_requests")
    .select("id, status, fps_id_snapshot, fps_name_snapshot")
    .in("id", requestIds);

  if (fetchError) {
    console.error("[batchCompleteAdminPayoutRequests] prefetch", fetchError);
    return { success: false, error: "無法載入提現單" };
  }

  if ((rows?.length ?? 0) !== requestIds.length) {
    return { success: false, error: "部分提現單不存在" };
  }

  for (const row of rows ?? []) {
    if (
      isFpsPayoutBlockedForComplete({
        status: normalizeFpsPayoutStatus(row.status),
        fpsId: row.fps_id_snapshot,
        fpsName: row.fps_name_snapshot,
      })
    ) {
      return {
        success: false,
        error: "所選提現單包含待賣家補充 FPS 的記錄，無法批量銷帳",
      };
    }
  }

  const { data, error } = await admin.rpc(
    "rpc_admin_batch_complete_fps_payout_requests",
    {
      p_request_ids: requestIds,
      p_admin_id: guard.adminId,
    },
  );

  if (error) {
    console.error("[batchCompleteAdminPayoutRequests]", error);
    return {
      success: false,
      error: error.message || "批量銷帳失敗",
    };
  }

  const payload = data as {
    completed_count?: number;
    order_numbers?: string[];
  } | null;

  revalidatePath("/admin/payouts");
  for (const orderNumber of payload?.order_numbers ?? []) {
    if (orderNumber) {
      revalidatePath(`/profile/user/orderDetail/${orderNumber}`);
    }
  }

  return {
    success: true,
    completedCount: payload?.completed_count ?? 0,
  };
}

export type RetryAdminMerchantConnectPayoutResult =
  | { success: true; data: { transferId?: string; alreadyApplied?: boolean } }
  | { success: false; error: string };

export async function retryAdminMerchantConnectPayout(
  orderId: string,
): Promise<RetryAdminMerchantConnectPayoutResult> {
  const guard = await requireAdmin();
  if (!guard.ok) {
    return { success: false, error: guard.error };
  }

  const trimmedOrderId = orderId.trim();
  if (!trimmedOrderId) {
    return { success: false, error: "訂單 ID 無效" };
  }

  const admin = createAdminClient();
  const { error: resetError } = await admin.rpc(
    "rpc_admin_reset_merchant_connect_payout_retry",
    {
      p_order_id: trimmedOrderId,
      p_admin_id: guard.adminId,
    },
  );

  if (resetError) {
    console.error("[retryAdminMerchantConnectPayout] reset", resetError);
    return {
      success: false,
      error: resetError.message || "無法重設撥款狀態",
    };
  }

  const payoutResult = await executeMerchantConnectPayout(trimmedOrderId);
  if (!payoutResult.success) {
    return {
      success: false,
      error:
        payoutResult.error === "撥款服務尚未設定"
          ? payoutResult.error
          : payoutResult.error || "撥款重試失敗",
    };
  }

  revalidatePath("/admin/payouts");

  return {
    success: true,
    data: {
      transferId: payoutResult.transferId,
      alreadyApplied: payoutResult.alreadyApplied,
    },
  };
}
