import type { createClient } from "@/lib/supabase/server";
import { isUuid } from "@/lib/marketplace/seller-profile";
import { MEMBER_ORDER_NUMBER_RE } from "@/lib/member-order/resolve-order-id";

export const INVALID_MERCHANT_ORDER_ID_ERROR =
  "訂單編號格式不正確，請從交易管理重新進入訂單";

export type ResolveMerchantOrderIdResult =
  | { ok: true; id: string }
  | { ok: false; error: string };

type ServerSupabaseClient = Awaited<ReturnType<typeof createClient>>;

/**
 * Admin override：管理員後台（商戶流水 / 爭議仲裁）需要跨越 merchant_id scope
 * 讀取任何一張獨立商戶訂單，以進行反洗錢逐單追蹤。
 *
 * TODO: [Admin Override] 目前由 caller 傳入 service-role client 並跳過 merchant_id
 *       filter 暫代 RLS policy，待 DB 層補上 is_admin() SECURITY DEFINER 函數與
 *       merchant_orders 的 admin bypass policy 後應改回統一走 RLS。
 */
export type ResolveMerchantOrderIdOptions = {
  adminOverride?: boolean;
};

/** 依 admin override 決定是否套用 merchant_id scope 限制。 */
function withMerchantScope<T extends { eq: (column: string, value: string) => T }>(
  query: T,
  merchantId: string,
  adminOverride: boolean,
): T {
  return adminOverride ? query : query.eq("merchant_id", merchantId);
}

/** 依 admin override 決定是否套用 buyer_id scope 限制。 */
function withBuyerScope<T extends { eq: (column: string, value: string) => T }>(
  query: T,
  buyerId: string,
  adminOverride: boolean,
): T {
  return adminOverride ? query : query.eq("buyer_id", buyerId);
}

async function lookupMerchantOrderById(
  supabase: ServerSupabaseClient,
  merchantId: string,
  orderId: string,
  adminOverride: boolean,
): Promise<string | null> {
  const { data, error } = await withMerchantScope(
    supabase.from("merchant_orders").select("id").eq("id", orderId),
    merchantId,
    adminOverride,
  ).maybeSingle();

  if (error) {
    return null;
  }

  const row = data as { id: string } | null;
  return row?.id ?? null;
}

async function lookupMerchantOrderByOrderNumber(
  supabase: ServerSupabaseClient,
  merchantId: string,
  orderNumber: string,
  adminOverride: boolean,
): Promise<string | null> {
  const { data, error } = await withMerchantScope(
    supabase
      .from("merchant_orders")
      .select("id")
      .eq("order_number", orderNumber.toUpperCase()),
    merchantId,
    adminOverride,
  ).maybeSingle();

  if (error) {
    return null;
  }

  const row = data as { id: string } | null;
  return row?.id ?? null;
}

async function lookupMerchantOrderByIdForBuyer(
  supabase: ServerSupabaseClient,
  buyerId: string,
  orderId: string,
  adminOverride: boolean,
): Promise<string | null> {
  const { data, error } = await withBuyerScope(
    supabase.from("merchant_orders").select("id").eq("id", orderId),
    buyerId,
    adminOverride,
  ).maybeSingle();

  if (error) {
    return null;
  }

  const row = data as { id: string } | null;
  return row?.id ?? null;
}

async function lookupMerchantOrderByOrderNumberForBuyer(
  supabase: ServerSupabaseClient,
  buyerId: string,
  orderNumber: string,
  adminOverride: boolean,
): Promise<string | null> {
  const { data, error } = await withBuyerScope(
    supabase
      .from("merchant_orders")
      .select("id")
      .eq("order_number", orderNumber.toUpperCase()),
    buyerId,
    adminOverride,
  ).maybeSingle();

  if (error) {
    return null;
  }

  const row = data as { id: string } | null;
  return row?.id ?? null;
}

export async function resolveMerchantOrderIdForBuyer(
  supabase: ServerSupabaseClient,
  orderIdOrNumber: string,
  buyerId: string,
  options: ResolveMerchantOrderIdOptions = {},
): Promise<ResolveMerchantOrderIdResult> {
  const adminOverride = options.adminOverride === true;
  const trimmed = orderIdOrNumber.trim();
  if (!trimmed) {
    return { ok: false, error: "找不到此訂單" };
  }

  if (isUuid(trimmed)) {
    const byOrderId = await lookupMerchantOrderByIdForBuyer(
      supabase,
      buyerId,
      trimmed,
      adminOverride,
    );
    if (byOrderId) {
      return { ok: true, id: byOrderId };
    }
  }

  if (MEMBER_ORDER_NUMBER_RE.test(trimmed)) {
    const byOrderNumber = await lookupMerchantOrderByOrderNumberForBuyer(
      supabase,
      buyerId,
      trimmed,
      adminOverride,
    );
    if (byOrderNumber) {
      return { ok: true, id: byOrderNumber };
    }

    return { ok: false, error: "找不到指定的交易訂單記錄" };
  }

  return { ok: false, error: INVALID_MERCHANT_ORDER_ID_ERROR };
}

export async function resolveMerchantOrderIdForMerchant(
  supabase: ServerSupabaseClient,
  orderIdOrNumber: string,
  merchantId: string,
  options: ResolveMerchantOrderIdOptions = {},
): Promise<ResolveMerchantOrderIdResult> {
  const adminOverride = options.adminOverride === true;
  const trimmed = orderIdOrNumber.trim();
  if (!trimmed) {
    return { ok: false, error: "找不到此訂單" };
  }

  if (isUuid(trimmed)) {
    const byOrderId = await lookupMerchantOrderById(
      supabase,
      merchantId,
      trimmed,
      adminOverride,
    );
    if (byOrderId) {
      return { ok: true, id: byOrderId };
    }
  }

  if (MEMBER_ORDER_NUMBER_RE.test(trimmed)) {
    const byOrderNumber = await lookupMerchantOrderByOrderNumber(
      supabase,
      merchantId,
      trimmed,
      adminOverride,
    );
    if (byOrderNumber) {
      return { ok: true, id: byOrderNumber };
    }

    return { ok: false, error: "找不到指定的交易訂單記錄" };
  }

  return { ok: false, error: INVALID_MERCHANT_ORDER_ID_ERROR };
}
