"use server";

import { revalidatePath } from "next/cache";
import { isCurrentUserAdmin } from "@/lib/auth/require-admin";
import { getOptionalAuthUser } from "@/lib/auth/session";
import { runAuthFeeCaptureSaga } from "@/lib/payments/auth-capture-saga";
import { runAuthIntakeConfirmSaga } from "@/lib/payments/auth-intake-confirm-saga";
import {
  isGradingFaultParty,
  runAuthGradingFailVoidSaga,
  type GradingFaultParty,
} from "@/lib/payments/auth-grading-fail-void-saga";
import { isAuthPassGradingOptionId } from "@/lib/grading/options";
import {
  enqueueB2cGradingFailSettlementMerchantEmail,
  enqueueB2cInboundShippedBuyerEmail,
  enqueueB2cBuyerConfirmedMerchantEmail,
  enqueueC2cBuyerConfirmedSellerEmail,
  enqueueC2cInboundShippedBuyerEmail,
  enqueueMemberGradingFailedEmails,
  enqueueMemberGradingIntakeEmails,
  enqueueMemberGradingPassedShippedEmails,
  enqueueMerchantGradingFailedEmails,
  enqueueMerchantGradingIntakeEmails,
  enqueueMerchantGradingPassedShippedEmails,
  enqueueC2cPayoutReleasedSellerEmail,
  enqueueC2cSellerReturnEmail,
} from "@/lib/notifications/grading-emails";
import { enqueueMerchantRecoveryDueEmail } from "@/lib/notifications/payout-emails";
import { runGoodsCaptureSaga } from "@/lib/payments/goods-capture-saga";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import {
  ADMIN_GRADING_TABS,
  type AdminGradingTab,
} from "@/lib/admin-grading/tabs";

export type { AdminGradingTab };

export type AdminGradingTabCounts = Record<AdminGradingTab, number>;

export type AdminGradingOrderKind = "member" | "merchant";

export type AdminGradingFaultParty =
  | "buyer"
  | "seller"
  | "platform"
  | "carrier"
  | "inconclusive";

export type AdminGradingQueueRow = {
  order_kind: AdminGradingOrderKind;
  order_id: string;
  order_number: string | null;
  buyer_id: string;
  counterparty_seller_id: string | null;
  merchant_id: string | null;
  listing_id: string;
  item_subtotal: number;
  shipping_fee: number;
  auth_fee: number;
  total_amount: number | null;
  buyer_total_amount: number | null;
  inbound_shipping_fee: number | null;
  outbound_shipping_fee: number | null;
  escrow_capture_model: string | null;
  inbound_tracking_no: string | null;
  outbound_tracking_no: string | null;
  auth_result: string | null;
  refund_status: string;
  refund_amount: number | null;
  escrow_status: string;
  platform_received_at: string | null;
  auth_graded_at: string | null;
  auth_grading_company: string | null;
  auth_grading_score: string | null;
  created_at: string | null;
  updated_at: string | null;
  buyer_display_name: string | null;
  buyer_username: string | null;
  seller_display_name: string | null;
  seller_username: string | null;
  shop_name: string | null;
  product_name_zh: string | null;
  product_name_ja: string | null;
  product_name_en: string | null;
  grading_company: string;
  grading_score: string | null;
  fault_party: string | null;
  seller_settlement_status: string | null;
  receivable_amount_hkd: number | null;
  recovery_total_hkd: number | null;
  recovery_applied_hkd: number | null;
  recovery_remaining_hkd: number | null;
};

export type AdminGradingAuditRow = {
  id: string;
  order_kind: AdminGradingOrderKind;
  order_id: string;
  admin_id: string | null;
  event_source?: "audit" | "ledger" | "receivable";
  action: string;
  from_status: string | null;
  to_status: string | null;
  notes: string | null;
  created_at: string;
  admin_display_name: string | null;
  admin_username: string | null;
  amount_hkd?: number | null;
  stripe_transfer_id?: string | null;
  source_payout_order_number?: string | null;
  source_payment_intent_id?: string | null;
};

type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

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

function mapRpcError(message: string): string {
  if (message.includes("無管理員權限")) {
    return "無管理員權限";
  }
  return message || "操作失敗，請稍後再試";
}

function revalidateGradingPaths(
  orderKind: AdminGradingOrderKind,
  orderId: string,
): void {
  revalidatePath("/admin/grading");
  revalidatePath(`/admin/grading/${orderKind}/${orderId}`);
  if (orderKind === "member") {
    revalidatePath("/profile/user/orderDetail/" + orderId);
    revalidatePath("/profile/user/trading");
  } else {
    revalidatePath("/profile/merchant/orderDetail/" + orderId);
    revalidatePath("/profile/merchant/trading");
    revalidatePath("/profile/user/orderDetail/" + orderId);
  }
}

async function resolveEscrowCaptureModel(input: {
  orderKind: AdminGradingOrderKind;
  orderId: string;
}): Promise<
  { ok: true; model: string | null } | { ok: false; error: string }
> {
  const supabase = asAdminGradingRpcClient(await createClient());
  const { data, error } = await supabase.rpc(
    "rpc_get_auth_escrow_capture_model",
    {
      p_order_kind: input.orderKind,
      p_order_id: input.orderId,
    },
  );

  if (error) {
    console.error("[resolveEscrowCaptureModel]", error.message);
    return { ok: false, error: error.message };
  }

  if (!data || typeof data !== "object") {
    return { ok: false, error: "無法讀取訂單扣款模式" };
  }

  const payload = data as { escrow_capture_model?: string | null };
  return {
    ok: true,
    model:
      typeof payload.escrow_capture_model === "string"
        ? payload.escrow_capture_model
        : null,
  };
}

function parseQueuePayload(data: unknown): {
  rows: AdminGradingQueueRow[];
  total: number;
  page: number;
  pageSize: number;
} | null {
  if (!data || typeof data !== "object") {
    return null;
  }

  const payload = data as Record<string, unknown>;
  const rows = Array.isArray(payload.rows) ? payload.rows : [];
  const total = typeof payload.total === "number" ? payload.total : 0;
  const page = typeof payload.page === "number" ? payload.page : 1;
  const pageSize = typeof payload.page_size === "number" ? payload.page_size : 20;

  return {
    rows: rows as AdminGradingQueueRow[],
    total,
    page,
    pageSize,
  };
}

function parseAuditPayload(data: unknown): AdminGradingAuditRow[] {
  if (!data || typeof data !== "object") {
    return [];
  }
  const rows = (data as { rows?: unknown }).rows;
  return Array.isArray(rows) ? (rows as AdminGradingAuditRow[]) : [];
}

function parseOrderPayload(data: unknown): AdminGradingQueueRow | null {
  if (!data || typeof data !== "object") {
    return null;
  }
  const row = (data as { row?: unknown }).row;
  if (!row || typeof row !== "object") {
    return null;
  }
  return row as AdminGradingQueueRow;
}

export async function getAdminGradingOrder(input: {
  orderKind: AdminGradingOrderKind;
  orderId: string;
}): Promise<ActionResult<AdminGradingQueueRow>> {
  const guard = await requireAdmin();
  if (!guard.ok) {
    return { success: false, error: guard.error };
  }

  const orderId = input.orderId.trim();
  if (!orderId) {
    return { success: false, error: "找不到此訂單" };
  }

  try {
    const supabase = asAdminGradingRpcClient(await createClient());
    const { data, error } = await supabase.rpc("get_admin_grading_order", {
      p_order_kind: input.orderKind,
      p_order_id: orderId,
    });

    if (!error) {
      const row = parseOrderPayload(data);
      if (row) {
        return { success: true, data: row };
      }
    } else {
      console.error("[getAdminGradingOrder]", error.message);
    }

    const scanned = await findAdminGradingOrderInQueues(
      supabase,
      input.orderKind,
      orderId,
    );
    if (scanned) {
      return { success: true, data: scanned };
    }

    return { success: false, error: "找不到此鑑定訂單" };
  } catch (error) {
    console.error("[getAdminGradingOrder]", error);
    return { success: false, error: "無法載入鑑定訂單" };
  }
}

async function findAdminGradingOrderInQueues(
  supabase: AdminGradingRpcClient,
  orderKind: AdminGradingOrderKind,
  orderId: string,
): Promise<AdminGradingQueueRow | null> {
  for (const tab of ADMIN_GRADING_TABS) {
    for (const keyword of [orderId, null] as const) {
      const { data, error } = await supabase.rpc("search_admin_grading_orders", {
        p_tab: tab,
        p_order_kind: orderKind,
        p_keyword: keyword,
        p_page: 1,
        p_page_size: 50,
      });

      if (error) {
        continue;
      }

      const parsed = parseQueuePayload(data);
      const row = parsed?.rows.find((candidate) => candidate.order_id === orderId);
      if (row) {
        return row;
      }
    }
  }

  return null;
}

export async function countAdminPendingGradingOrders(): Promise<ActionResult<number>> {
  const guard = await requireAdmin();
  if (!guard.ok) {
    return { success: false, error: guard.error };
  }

  const tabs: AdminGradingTab[] = [
    "awaiting_intake",
    "grading",
    "awaiting_outbound",
    "awaiting_settlement",
  ];

  try {
    const supabase = asAdminGradingRpcClient(await createClient());
    const results = await Promise.all(
      tabs.map((tab) =>
        supabase.rpc("search_admin_grading_orders", {
          p_tab: tab,
          p_order_kind: null,
          p_keyword: null,
          p_page: 1,
          p_page_size: 1,
        }),
      ),
    );

    for (const result of results) {
      if (result.error) {
        console.error("[countAdminPendingGradingOrders]", result.error.message);
        return { success: false, error: mapRpcError(result.error.message) };
      }
    }

    const total = results.reduce((sum, result) => {
      const parsed = parseQueuePayload(result.data);
      return sum + (parsed?.total ?? 0);
    }, 0);

    return { success: true, data: total };
  } catch (error) {
    console.error("[countAdminPendingGradingOrders]", error);
    return { success: false, error: "無法載入待處理鑑定訂單數量" };
  }
}

type AdminGradingRpcClient = {
  rpc(
    fn: "search_admin_grading_orders",
    args: {
      p_tab: AdminGradingTab;
      p_order_kind: AdminGradingOrderKind | null;
      p_keyword: string | null;
      p_page: number;
      p_page_size: number;
    },
  ): Promise<{ data: unknown; error: { message: string } | null }>;
  rpc(
    fn: "rpc_get_auth_escrow_capture_model",
    args: { p_order_kind: AdminGradingOrderKind; p_order_id: string },
  ): Promise<{ data: unknown; error: { message: string } | null }>;
  rpc(
    fn: "rpc_admin_confirm_grading_intake",
    args: { p_order_kind: AdminGradingOrderKind; p_order_id: string },
  ): Promise<{ data: unknown; error: { message: string } | null }>;
  rpc(
    fn: "rpc_admin_submit_seller_return_tracking",
    args: {
      p_order_kind: AdminGradingOrderKind;
      p_order_id: string;
      p_tracking_no: string;
    },
  ): Promise<{ data: unknown; error: { message: string } | null }>;
  rpc(
    fn: "rpc_admin_clear_seller_settlement",
    args: {
      p_order_kind: AdminGradingOrderKind;
      p_order_id: string;
      p_fps_reference: string | null;
      p_notes: string | null;
    },
  ): Promise<{ data: unknown; error: { message: string } | null }>;
  rpc(
    fn: "rpc_admin_submit_grading_outbound",
    args: {
      p_order_kind: AdminGradingOrderKind;
      p_order_id: string;
      p_tracking_no: string;
    },
  ): Promise<{ data: unknown; error: { message: string } | null }>;
  rpc(
    fn: "get_admin_grading_audit_history",
    args: { p_order_kind: AdminGradingOrderKind; p_order_id: string },
  ): Promise<{ data: unknown; error: { message: string } | null }>;
  rpc(
    fn: "get_admin_grading_order",
    args: { p_order_kind: AdminGradingOrderKind; p_order_id: string },
  ): Promise<{ data: unknown; error: { message: string } | null }>;
};

function asAdminGradingRpcClient(
  supabase: Awaited<ReturnType<typeof createClient>>,
): AdminGradingRpcClient {
  return supabase as unknown as AdminGradingRpcClient;
}

export async function searchAdminGradingOrders(params: {
  tab: AdminGradingTab;
  orderKind?: AdminGradingOrderKind | "all";
  keyword?: string;
  page?: number;
  pageSize?: number;
}): Promise<
  ActionResult<{
    rows: AdminGradingQueueRow[];
    total: number;
    page: number;
    pageSize: number;
  }>
> {
  const guard = await requireAdmin();
  if (!guard.ok) {
    return { success: false, error: guard.error };
  }

  try {
    const supabase = asAdminGradingRpcClient(await createClient());
    const { data, error } = await supabase.rpc("search_admin_grading_orders", {
      p_tab: params.tab,
      p_order_kind:
        params.orderKind && params.orderKind !== "all"
          ? params.orderKind
          : null,
      p_keyword: params.keyword?.trim() || null,
      p_page: params.page ?? 1,
      p_page_size: params.pageSize ?? 20,
    });

    if (error) {
      console.error("[searchAdminGradingOrders]", error.message);
      return { success: false, error: mapRpcError(error.message) };
    }

    const parsed = parseQueuePayload(data);
    if (!parsed) {
      return { success: false, error: "無法載入鑑定佇列" };
    }

    return { success: true, data: parsed };
  } catch (error) {
    console.error("[searchAdminGradingOrders]", error);
    return { success: false, error: "無法載入鑑定佇列" };
  }
}

export async function getAdminGradingTabCounts(params?: {
  orderKind?: AdminGradingOrderKind | "all";
  keyword?: string;
}): Promise<ActionResult<AdminGradingTabCounts>> {
  const guard = await requireAdmin();
  if (!guard.ok) {
    return { success: false, error: guard.error };
  }

  const orderKind =
    params?.orderKind && params.orderKind !== "all" ? params.orderKind : null;
  const keyword = params?.keyword?.trim() || null;

  try {
    const supabase = asAdminGradingRpcClient(await createClient());
    const results = await Promise.all(
      ADMIN_GRADING_TABS.map((tab) =>
        supabase.rpc("search_admin_grading_orders", {
          p_tab: tab,
          p_order_kind: orderKind,
          p_keyword: keyword,
          p_page: 1,
          p_page_size: 1,
        }),
      ),
    );

    for (const result of results) {
      if (result.error) {
        console.error("[getAdminGradingTabCounts]", result.error.message);
        return { success: false, error: mapRpcError(result.error.message) };
      }
    }

    const counts = {} as AdminGradingTabCounts;
    ADMIN_GRADING_TABS.forEach((tab, index) => {
      const parsed = parseQueuePayload(results[index].data);
      counts[tab] = parsed?.total ?? 0;
    });

    return { success: true, data: counts };
  } catch (error) {
    console.error("[getAdminGradingTabCounts]", error);
    return { success: false, error: "無法載入佇列數量" };
  }
}

export async function adminConfirmGradingIntake(input: {
  orderKind: AdminGradingOrderKind;
  orderId: string;
}): Promise<ActionResult<{ applied: true }>> {
  const guard = await requireAdmin();
  if (!guard.ok) {
    return { success: false, error: guard.error };
  }

  const orderId = input.orderId.trim();
  if (!orderId) {
    return { success: false, error: "找不到此訂單" };
  }

  try {
    const resolved = await resolveEscrowCaptureModel({
      orderKind: input.orderKind,
      orderId,
    });

    if (!resolved.ok) {
      return { success: false, error: mapRpcError(resolved.error) };
    }

    const result =
      resolved.model === "single"
        ? await runAuthIntakeConfirmSaga({
            orderKind: input.orderKind,
            orderId,
          })
        : await runAuthFeeCaptureSaga({
            orderKind: input.orderKind,
            orderId,
          });

    if (!result.ok) {
      console.error("[adminConfirmGradingIntake]", result.error);
      return { success: false, error: mapRpcError(result.error) };
    }

    revalidateGradingPaths(input.orderKind, orderId);
    if (input.orderKind === "member") {
      await enqueueMemberGradingIntakeEmails(orderId);
    } else {
      await enqueueMerchantGradingIntakeEmails(orderId);
    }
    return { success: true, data: { applied: true } };
  } catch (error) {
    console.error("[adminConfirmGradingIntake]", error);
    return { success: false, error: "入庫確認失敗，請稍後再試" };
  }
}

export async function adminPassGrading(input: {
  orderKind: AdminGradingOrderKind;
  orderId: string;
  gradingOptionId: string;
  notes?: string;
}): Promise<ActionResult<{ applied: true }>> {
  const guard = await requireAdmin();
  if (!guard.ok) {
    return { success: false, error: guard.error };
  }

  const orderId = input.orderId.trim();
  if (!orderId) {
    return { success: false, error: "找不到此訂單" };
  }

  const gradingOptionId = input.gradingOptionId.trim();
  if (!isAuthPassGradingOptionId(gradingOptionId)) {
    return { success: false, error: "請選擇鑑定等級" };
  }

  try {
    const result = await runGoodsCaptureSaga({
      orderKind: input.orderKind,
      orderId,
      gradingOptionId,
      notes: input.notes,
    });

    if (!result.ok) {
      console.error("[adminPassGrading]", result.error);
      return { success: false, error: mapRpcError(result.error) };
    }

    revalidateGradingPaths(input.orderKind, orderId);
    return { success: true, data: { applied: true } };
  } catch (error) {
    console.error("[adminPassGrading]", error);
    return { success: false, error: "鑑定通過操作失敗，請稍後再試" };
  }
}

export async function adminSubmitGradingOutbound(input: {
  orderKind: AdminGradingOrderKind;
  orderId: string;
  trackingNo: string;
}): Promise<ActionResult<{ applied: true }>> {
  const guard = await requireAdmin();
  if (!guard.ok) {
    return { success: false, error: guard.error };
  }

  const orderId = input.orderId.trim();
  const trackingNo = input.trackingNo.trim();
  if (!orderId) {
    return { success: false, error: "找不到此訂單" };
  }
  if (!trackingNo) {
    return { success: false, error: "請輸入出庫物流單號" };
  }

  try {
    const supabase = asAdminGradingRpcClient(await createClient());
    const { error } = await supabase.rpc("rpc_admin_submit_grading_outbound", {
      p_order_kind: input.orderKind,
      p_order_id: orderId,
      p_tracking_no: trackingNo,
    });

    if (error) {
      console.error("[adminSubmitGradingOutbound]", error.message);
      return { success: false, error: mapRpcError(error.message) };
    }

    revalidateGradingPaths(input.orderKind, orderId);
    if (input.orderKind === "member") {
      await enqueueMemberGradingPassedShippedEmails(orderId, {
        trackingNo,
      });
    } else {
      await enqueueMerchantGradingPassedShippedEmails(orderId, {
        trackingNo,
      });
    }
    return { success: true, data: { applied: true } };
  } catch (error) {
    console.error("[adminSubmitGradingOutbound]", error);
    return { success: false, error: "出庫物流更新失敗，請稍後再試" };
  }
}

export async function adminFailGradingAndRefund(input: {
  orderKind: AdminGradingOrderKind;
  orderId: string;
  faultParty: GradingFaultParty;
  reason?: string;
  carrierLiabilityParty?: "seller" | "platform";
}): Promise<ActionResult<{ applied: true }>> {
  const guard = await requireAdmin();
  if (!guard.ok) {
    return { success: false, error: guard.error };
  }

  const orderId = input.orderId.trim();
  if (!orderId) {
    return { success: false, error: "找不到此訂單" };
  }

  if (!isGradingFaultParty(input.faultParty)) {
    return { success: false, error: "請選擇責任方" };
  }

  if (
    input.faultParty === "carrier" &&
    input.carrierLiabilityParty !== "seller" &&
    input.carrierLiabilityParty !== "platform"
  ) {
    return { success: false, error: "物流責任請選擇承擔方（賣家或平台）" };
  }

  if (input.faultParty === "platform" && !input.reason?.trim()) {
    return { success: false, error: "平台責任請填寫原因" };
  }

  try {
    const result = await runAuthGradingFailVoidSaga({
      orderKind: input.orderKind,
      orderId,
      faultParty: input.faultParty,
      reason: input.reason,
      carrierLiabilityParty: input.carrierLiabilityParty,
    });

    if (!result.ok) {
      console.error("[adminFailGradingAndRefund]", result.error);
      return { success: false, error: mapRpcError(result.error) };
    }

    revalidateGradingPaths(input.orderKind, orderId);
    if (input.orderKind === "member") {
      await enqueueMemberGradingFailedEmails(orderId);
    } else {
      await enqueueMerchantGradingFailedEmails(orderId);
      await enqueueB2cGradingFailSettlementMerchantEmail(orderId);
      await enqueueMerchantRecoveryDueEmail(orderId);
    }
    return { success: true, data: { applied: true } };
  } catch (error) {
    console.error("[adminFailGradingAndRefund]", error);
    return { success: false, error: "鑑定失敗處理未完成，請稍後重試" };
  }
}

export async function adminClearSellerSettlement(input: {
  orderKind: AdminGradingOrderKind;
  orderId: string;
  fpsReference?: string;
  notes?: string;
}): Promise<ActionResult<{ applied: true }>> {
  const guard = await requireAdmin();
  if (!guard.ok) {
    return { success: false, error: guard.error };
  }

  const orderId = input.orderId.trim();
  if (!orderId) {
    return { success: false, error: "找不到此訂單" };
  }

  try {
    const supabase = asAdminGradingRpcClient(await createClient());
    const { error } = await supabase.rpc("rpc_admin_clear_seller_settlement", {
      p_order_kind: input.orderKind,
      p_order_id: orderId,
      p_fps_reference: input.fpsReference?.trim() || null,
      p_notes: input.notes?.trim() || null,
    });

    if (error) {
      console.error("[adminClearSellerSettlement]", error.message);
      return { success: false, error: mapRpcError(error.message) };
    }

    revalidateGradingPaths(input.orderKind, orderId);
    if (input.orderKind === "member") {
      await enqueueC2cPayoutReleasedSellerEmail(orderId);
    }
    return { success: true, data: { applied: true } };
  } catch (error) {
    console.error("[adminClearSellerSettlement]", error);
    return { success: false, error: "確認收款失敗，請稍後再試" };
  }
}

export async function adminSubmitSellerReturnTracking(input: {
  orderKind: AdminGradingOrderKind;
  orderId: string;
  trackingNo: string;
}): Promise<ActionResult<{ applied: true }>> {
  const guard = await requireAdmin();
  if (!guard.ok) {
    return { success: false, error: guard.error };
  }

  const orderId = input.orderId.trim();
  const trackingNo = input.trackingNo.trim();
  if (!orderId) {
    return { success: false, error: "找不到此訂單" };
  }
  if (!trackingNo) {
    return { success: false, error: "請輸入寄回物流單號" };
  }

  try {
    const supabase = asAdminGradingRpcClient(await createClient());
    const { error } = await supabase.rpc(
      "rpc_admin_submit_seller_return_tracking",
      {
        p_order_kind: input.orderKind,
        p_order_id: orderId,
        p_tracking_no: trackingNo,
      },
    );

    if (error) {
      console.error("[adminSubmitSellerReturnTracking]", error.message);
      return { success: false, error: mapRpcError(error.message) };
    }

    revalidateGradingPaths(input.orderKind, orderId);
    if (input.orderKind === "member") {
      await enqueueC2cSellerReturnEmail(orderId);
    }
    return { success: true, data: { applied: true } };
  } catch (error) {
    console.error("[adminSubmitSellerReturnTracking]", error);
    return { success: false, error: "寄回物流更新失敗，請稍後再試" };
  }
}

export async function getAdminGradingAuditHistory(input: {
  orderKind: AdminGradingOrderKind;
  orderId: string;
}): Promise<ActionResult<AdminGradingAuditRow[]>> {
  const guard = await requireAdmin();
  if (!guard.ok) {
    return { success: false, error: guard.error };
  }

  const orderId = input.orderId.trim();
  if (!orderId) {
    return { success: false, error: "找不到此訂單" };
  }

  try {
    const supabase = asAdminGradingRpcClient(await createClient());
    const { data, error } = await supabase.rpc(
      "get_admin_grading_audit_history",
      {
        p_order_kind: input.orderKind,
        p_order_id: orderId,
      },
    );

    if (error) {
      console.error("[getAdminGradingAuditHistory]", error.message);
      return { success: false, error: mapRpcError(error.message) };
    }

    return { success: true, data: parseAuditPayload(data) };
  } catch (error) {
    console.error("[getAdminGradingAuditHistory]", error);
    return { success: false, error: "無法載入審計紀錄" };
  }
}
