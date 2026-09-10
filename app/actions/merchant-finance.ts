"use server";

import { getOptionalAuthUser } from "@/lib/auth/session";
import {
  mapMerchantFinanceSettlementsRpcPayload,
  type MerchantFinanceSettlementsRpcPayload,
} from "@/lib/merchant-finance/map-merchant-finance-settlements";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";

type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

export type MerchantFinanceSettlement = {
  orderId: string;
  orderNumber: string | null;
  cardName: string | null;
  amount: number;
  commissionAmount: number | null;
  paidAt: string | null;
  payoutStatus: string;
  payoutHoldUntil: string | null;
  stripeTransferId: string | null;
  stripePaymentIntentId: string | null;
  payoutError: string | null;
};

export type MerchantFinanceSummary = {
  monthEarned: number;
  recentSettlements: MerchantFinanceSettlement[];
};

export type MerchantFinanceStatusFilter =
  | "all"
  | "paid"
  | "held"
  | "processing"
  | "failed";

export type MerchantFinanceSort = "transferred_at-desc" | "transferred_at-asc";

export type ListMerchantFinanceSettlementsInput = {
  page?: number;
  pageSize?: number;
  statusFilter?: MerchantFinanceStatusFilter;
  sort?: MerchantFinanceSort;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
};

export type MerchantFinanceSettlementsPage = {
  rows: MerchantFinanceSettlement[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  monthEarned: number;
};

type MerchantFinanceRpcArgs = {
  p_page: number;
  p_page_size: number;
  p_status_filter: MerchantFinanceStatusFilter;
  p_sort: MerchantFinanceSort;
  p_date_from: string | null;
  p_date_to: string | null;
  p_search: string | null;
};

function mapRpcPayload(
  payload: MerchantFinanceSettlementsRpcPayload,
): MerchantFinanceSettlementsPage {
  return {
    monthEarned: payload.monthEarned,
    total: payload.total,
    page: payload.page,
    pageSize: payload.pageSize,
    totalPages: payload.totalPages,
    rows: payload.rows.map((row) => ({
      orderId: row.orderId,
      orderNumber: row.orderNumber,
      cardName: row.cardName,
      amount: row.amount,
      commissionAmount: row.commissionAmount,
      paidAt: row.paidAt,
      payoutStatus: row.payoutStatus,
      payoutHoldUntil: row.payoutHoldUntil,
      stripeTransferId: row.stripeTransferId,
      stripePaymentIntentId: row.stripePaymentIntentId,
      payoutError: row.payoutError,
    })),
  };
}

export async function listMerchantFinanceSettlements(
  input: ListMerchantFinanceSettlementsInput = {},
): Promise<ActionResult<MerchantFinanceSettlementsPage>> {
  if (!isSupabaseConfigured()) {
    return { success: false, error: "未登入" };
  }

  try {
    const user = await getOptionalAuthUser();
    if (!user) {
      return { success: false, error: "請先登入" };
    }

    const supabase = await createClient();
    const rpcArgs: MerchantFinanceRpcArgs = {
      p_page: Math.max(1, input.page ?? 1),
      p_page_size: Math.min(50, Math.max(5, input.pageSize ?? 10)),
      p_status_filter: input.statusFilter ?? "all",
      p_sort: input.sort ?? "transferred_at-desc",
      p_date_from: input.dateFrom ?? null,
      p_date_to: input.dateTo ?? null,
      p_search: input.search?.trim() || null,
    };

    const { data, error } = await (
      supabase as unknown as {
        rpc: (
          fn: "rpc_list_merchant_finance_settlements",
          args: MerchantFinanceRpcArgs,
        ) => Promise<{
          data: MerchantFinanceSettlementsRpcPayload | { error?: string } | null;
          error: { message: string } | null;
        }>;
      }
    ).rpc("rpc_list_merchant_finance_settlements", rpcArgs);

    if (error) {
      console.error("[listMerchantFinanceSettlements]", error.message);
      return { success: false, error: "無法載入撥款記錄" };
    }

    if (data && typeof data === "object" && "error" in data && data.error) {
      return { success: false, error: data.error };
    }

    const mapped = mapMerchantFinanceSettlementsRpcPayload(data);
    if (!mapped) {
      console.error("[listMerchantFinanceSettlements] invalid RPC payload");
      return { success: false, error: "無法載入撥款記錄" };
    }

    return { success: true, data: mapRpcPayload(mapped) };
  } catch (error) {
    console.error("[listMerchantFinanceSettlements]", error);
    return { success: false, error: "無法載入撥款記錄" };
  }
}

export async function getMerchantFinanceSummary(): Promise<
  ActionResult<MerchantFinanceSummary>
> {
  const pageResult = await listMerchantFinanceSettlements({
    page: 1,
    pageSize: 20,
    sort: "transferred_at-desc",
  });

  if (!pageResult.success) {
    return pageResult;
  }

  return {
    success: true,
    data: {
      monthEarned: pageResult.data.monthEarned,
      recentSettlements: pageResult.data.rows,
    },
  };
}
