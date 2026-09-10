"use server";

import type Stripe from "stripe";
import { resolveOfferCardDisplayImage } from "@/app/lib/chat/offerCardImage";
import { getMemberAuthOrderActions } from "@/app/lib/member-order/auth-escrow";
import { formatTradeGradeLabel } from "@/lib/marketplace/listing-display";
import { AUTH_ESCROW_CAPTURE_MODEL_SINGLE } from "@/lib/payments/escrow-payment-intent";
import { calculateMemberAuthPaymentTotal } from "@/lib/payments/member-auth-payment";
import {
  estimateAuthEscrowCheckoutTotal,
  resolveAuthEscrowSfLegFeeHkd,
} from "@/lib/auth-escrow/defaults";
import {
  fetchPlatformAuthFeeHkd,
  resolveAuthFeeFromRow,
} from "@/lib/platform/resolve-display-auth-fee";
import { resolveMemberOrderIdForUser } from "@/lib/member-order/resolve-order-id";
import { getStripeClient, getStripePublishableKey } from "@/lib/stripe/env";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import { requireActiveAuthUser } from "@/lib/auth/mutation-guard";
import type { Tables } from "@/types/supabase";
import type { MemberEscrowStatus } from "@/app/lib/member-order/auth-escrow";

type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

export type MemberAuthCheckoutOrder = {
  orderId: string;
  orderNumber: string | null;
  listingId: string;
  escrowStatus: MemberEscrowStatus | null;
  isPayable: boolean;
  canPay: boolean;
  itemSubtotal: number;
  authFee: number;
  inboundShippingFee: number;
  outboundShippingFee: number;
  totalAmount: number;
  buyerTotalAmount: number;
  paymentAmount: number;
  useAuthentication: boolean;
  platformAuthFeeHkd: number;
  seller: {
    id: string;
    displayName: string;
    username: string | null;
  };
  product: {
    cardName: string;
    cardNumber: string | null;
    setCode: string;
    displayId: string | null;
    gradeLabel: string;
    imageUrl: string;
  };
};

export type MemberAuthCheckoutPaymentIntent = {
  orderId: string;
  clientSecret: string;
  publishableKey: string;
  itemSubtotal: number;
  authFee: number;
  inboundShippingFee: number;
  outboundShippingFee: number;
  totalAmount: number;
  buyerTotalAmount: number;
  platformSubsidyAmount: number;
};

export type MemberAuthPaymentStatus = {
  orderId: string;
  orderNumber: string | null;
  escrowStatus: MemberEscrowStatus | null;
  paymentConfirmedAt: string | null;
  paymentCaptureStatus: string | null;
  totalAmount: number;
};

type MemberAuthCheckoutRow = Pick<
  Tables<"member_orders">,
  | "id"
  | "order_number"
  | "buyer_id"
  | "seller_id"
  | "listing_id"
  | "final_price"
  | "item_subtotal"
  | "auth_fee"
  | "inbound_shipping_fee"
  | "outbound_shipping_fee"
  | "total_amount"
  | "buyer_total_amount"
  | "escrow_status"
  | "use_authentication"
  | "status"
  | "payment_confirmed_at"
  | "stripe_payment_intent_id"
  | "payment_capture_status"
> & {
  listings: {
    grading_company: string;
    grading_score: string | null;
    images: unknown;
    product_catalog: {
      name_ja: string;
      name_zh: string | null;
      name_en: string | null;
      card_number: string | null;
      set_code: string;
      display_id: string | null;
      image_url: string;
    } | null;
  } | null;
};

function displayCardName(catalog: {
  name_ja: string;
  name_zh: string | null;
  name_en: string | null;
}): string {
  return (
    catalog.name_zh?.trim() ||
    catalog.name_en?.trim() ||
    catalog.name_ja?.trim() ||
    "未知商品"
  );
}

type PrepareMemberAuthPaymentPayload = {
  order_id: string;
  buyer_id: string;
  seller_id: string;
  listing_id: string;
  item_subtotal: number;
  auth_fee: number;
  inbound_shipping_fee: number;
  outbound_shipping_fee: number;
  total_amount: number;
  buyer_total_amount: number;
  platform_subsidy_amount: number;
  stripe_payment_intent_id: string | null;
};

type ServerSupabaseClient = Awaited<ReturnType<typeof createClient>>;

type MemberAuthCheckoutRpcClient = {
  rpc(
    fn: "rpc_prepare_member_auth_order_payment",
    args: { p_order_id: string; p_user_reward_id?: string | null },
  ): Promise<{ data: unknown; error: { message: string } | null }>;
  rpc(
    fn: "rpc_attach_member_auth_order_payment_intent",
    args: { p_order_id: string; p_payment_intent_id: string },
  ): Promise<{ data: unknown; error: { message: string } | null }>;
};

const MEMBER_AUTH_CHECKOUT_SELECT = `
  id,
  order_number,
  buyer_id,
  seller_id,
  listing_id,
  final_price,
  item_subtotal,
  auth_fee,
  inbound_shipping_fee,
  outbound_shipping_fee,
  total_amount,
  buyer_total_amount,
  escrow_status,
  use_authentication,
  status,
  payment_confirmed_at,
  stripe_payment_intent_id,
  payment_capture_status,
  listings (
    grading_company,
    grading_score,
    images,
    product_catalog (
      name_ja,
      name_zh,
      name_en,
      card_number,
      set_code,
      display_id,
      image_url
    )
  )
`;

function asMemberAuthCheckoutRpcClient(
  supabase: ServerSupabaseClient,
): MemberAuthCheckoutRpcClient {
  return supabase as unknown as MemberAuthCheckoutRpcClient;
}

function parsePreparePayload(data: unknown): PrepareMemberAuthPaymentPayload | null {
  if (!data || typeof data !== "object") {
    return null;
  }

  const payload = data as Record<string, unknown>;
  if (
    typeof payload.order_id !== "string" ||
    typeof payload.buyer_id !== "string" ||
    typeof payload.seller_id !== "string" ||
    typeof payload.listing_id !== "string"
  ) {
    return null;
  }

  return {
    order_id: payload.order_id,
    buyer_id: payload.buyer_id,
    seller_id: payload.seller_id,
    listing_id: payload.listing_id,
    item_subtotal: Number(payload.item_subtotal ?? 0),
    auth_fee: Number(payload.auth_fee ?? 0),
    inbound_shipping_fee: Number(payload.inbound_shipping_fee ?? 0),
    outbound_shipping_fee: Number(payload.outbound_shipping_fee ?? 0),
    total_amount: Number(payload.total_amount ?? 0),
    buyer_total_amount: Number(
      payload.buyer_total_amount ?? payload.total_amount ?? 0,
    ),
    platform_subsidy_amount: Number(payload.platform_subsidy_amount ?? 0),
    stripe_payment_intent_id:
      typeof payload.stripe_payment_intent_id === "string"
        ? payload.stripe_payment_intent_id
        : null,
  };
}

async function loadMemberAuthCheckoutRow(
  supabase: ServerSupabaseClient,
  orderIdOrNumber: string,
  userId: string,
): Promise<ActionResult<MemberAuthCheckoutRow>> {
  const resolved = await resolveMemberOrderIdForUser(
    supabase,
    orderIdOrNumber,
    userId,
  );

  if (!resolved.ok) {
    return { success: false, error: resolved.error };
  }

  const { data, error } = await supabase
    .from("member_orders")
    .select(MEMBER_AUTH_CHECKOUT_SELECT)
    .eq("id", resolved.id)
    .maybeSingle<MemberAuthCheckoutRow>();

  if (error) {
    console.error("[loadMemberAuthCheckoutRow]", error.message);
    return { success: false, error: "無法載入訂單資料" };
  }

  if (!data) {
    return { success: false, error: "找不到指定的交易訂單記錄" };
  }

  if (data.buyer_id !== userId && data.seller_id !== userId) {
    return { success: false, error: "您沒有權限查閱此訂單" };
  }

  return { success: true, data };
}

function mapCheckoutSnapshot(
  row: MemberAuthCheckoutRow,
  viewerId: string,
  seller: { display_name: string; username: string | null },
  platformAuthFeeHkd: number,
): MemberAuthCheckoutOrder {
  const isBuyer = row.buyer_id === viewerId;
  const itemSubtotal = Number(row.item_subtotal ?? row.final_price);
  const authFee = resolveAuthFeeFromRow(
    Number(row.auth_fee ?? 0),
    Boolean(row.use_authentication),
    platformAuthFeeHkd,
  );
  const inboundFromRow = Number(row.inbound_shipping_fee ?? 0);
  const outboundFromRow = Number(row.outbound_shipping_fee ?? 0);
  const inboundShippingFee = Boolean(row.use_authentication)
    ? resolveAuthEscrowSfLegFeeHkd(inboundFromRow)
    : inboundFromRow;
  const outboundShippingFee = Boolean(row.use_authentication)
    ? resolveAuthEscrowSfLegFeeHkd(outboundFromRow)
    : outboundFromRow;
  const totalFromRow = Number(row.total_amount ?? 0);
  const totalAmount = Boolean(row.use_authentication)
    ? totalFromRow > itemSubtotal
      ? totalFromRow
      : estimateAuthEscrowCheckoutTotal(itemSubtotal, platformAuthFeeHkd)
    : Number(row.total_amount ?? calculateMemberAuthPaymentTotal(itemSubtotal));
  const buyerTotalAmount = Number(
    row.buyer_total_amount ?? row.total_amount ?? totalAmount,
  );
  const authActions = getMemberAuthOrderActions({
    persona: isBuyer ? "buy" : "sell",
    useAuthentication: row.use_authentication,
    escrowStatus: row.escrow_status,
    status: row.status,
  });

  const isPayable =
    Boolean(row.use_authentication) &&
    row.escrow_status === "payment" &&
    row.payment_confirmed_at == null &&
    row.status === "pending";

  const catalog = row.listings?.product_catalog;

  return {
    orderId: row.id,
    orderNumber: row.order_number,
    listingId: row.listing_id,
    escrowStatus: row.escrow_status,
    isPayable,
    canPay: isBuyer && authActions.canPay && row.payment_confirmed_at == null,
    itemSubtotal,
    authFee,
    inboundShippingFee,
    outboundShippingFee,
    totalAmount,
    buyerTotalAmount,
    paymentAmount: buyerTotalAmount,
    useAuthentication: row.use_authentication,
    platformAuthFeeHkd,
    seller: {
      id: row.seller_id,
      displayName:
        seller.display_name?.trim() ||
        seller.username?.trim() ||
        "賣家",
      username: seller.username,
    },
    product: {
      cardName: catalog ? displayCardName(catalog) : "未知商品",
      cardNumber: catalog?.card_number ?? null,
      setCode: catalog?.set_code ?? "",
      displayId: catalog?.display_id ?? null,
      gradeLabel: formatTradeGradeLabel(
        row.listings?.grading_company ?? "",
        row.listings?.grading_score ?? null,
      ),
      imageUrl: resolveOfferCardDisplayImage(
        row.listings?.images,
        catalog?.image_url,
      ),
    },
  };
}

/** 鑑定託管訂單付款快照（買家 / 賣家可讀）。 */
export async function loadMemberAuthCheckoutOrder(
  orderIdOrNumber: string,
): Promise<ActionResult<MemberAuthCheckoutOrder>> {
  if (!isSupabaseConfigured()) {
    return { success: false, error: "未登入" };
  }

  try {
    const auth = await requireActiveAuthUser();
    if (!auth.ok) {
      return { success: false, error: auth.error };
    }
    const { user, supabase } = auth;

    const rowResult = await loadMemberAuthCheckoutRow(
      supabase,
      orderIdOrNumber,
      user.id,
    );
    if (!rowResult.success) {
      return rowResult;
    }

    const { data: sellerProfile } = await supabase
      .from("profiles")
      .select("display_name, username")
      .eq("id", rowResult.data.seller_id)
      .maybeSingle<Pick<Tables<"profiles">, "display_name" | "username">>();

    const platformAuthFeeHkd = await fetchPlatformAuthFeeHkd();

    return {
      success: true,
      data: mapCheckoutSnapshot(
        rowResult.data,
        user.id,
        sellerProfile ?? { display_name: "賣家", username: null },
        platformAuthFeeHkd,
      ),
    };
  } catch (error) {
    console.error("[loadMemberAuthCheckoutOrder]", error);
    return { success: false, error: "載入訂單資料時發生錯誤" };
  }
}

/**
 * 建立（或重用）鑑定託管 PaymentIntent — 資金 100% 入平台 Stripe 帳戶。
 */
export async function createMemberAuthPaymentIntent(
  orderIdOrNumber: string,
  options?: { userRewardId?: string | null },
): Promise<ActionResult<MemberAuthCheckoutPaymentIntent>> {
  if (!isSupabaseConfigured()) {
    return { success: false, error: "未登入" };
  }

  const publishableKey = getStripePublishableKey();
  const stripe = await getStripeClient();
  if (!stripe || !publishableKey) {
    return { success: false, error: "付款服務尚未設定，請稍後再試" };
  }

  try {
    const auth = await requireActiveAuthUser();
    if (!auth.ok) {
      return { success: false, error: auth.error };
    }
    const { user, supabase } = auth;

    const rowResult = await loadMemberAuthCheckoutRow(
      supabase,
      orderIdOrNumber,
      user.id,
    );
    if (!rowResult.success) {
      return rowResult;
    }

    const row = rowResult.data;

    if (row.buyer_id !== user.id) {
      return { success: false, error: "僅買家本人可完成此筆託管付款" };
    }

    if (!row.use_authentication) {
      return { success: false, error: "此訂單非鑑定託管流程" };
    }

    if (row.escrow_status !== "payment" || row.payment_confirmed_at != null) {
      return { success: false, error: "此訂單並非待付款狀態，無法重複付款" };
    }

    const trimmedCouponId = options?.userRewardId?.trim() || null;

    const { data: prepareData, error: prepareError } =
      await asMemberAuthCheckoutRpcClient(supabase).rpc(
        "rpc_prepare_member_auth_order_payment",
        {
          p_order_id: row.id,
          p_user_reward_id: trimmedCouponId,
        },
      );

    if (prepareError) {
      console.error(
        "[createMemberAuthPaymentIntent] prepare",
        prepareError.message,
      );
      return { success: false, error: prepareError.message };
    }

    const prepared = parsePreparePayload(prepareData);
    if (!prepared) {
      console.error(
        "[createMemberAuthPaymentIntent] invalid prepare payload",
        prepareData,
      );
      return { success: false, error: "結帳金額計算失敗，請重試" };
    }

    const amountInCents = Math.round(prepared.buyer_total_amount * 100);
    if (!Number.isFinite(amountInCents) || amountInCents <= 0) {
      return { success: false, error: "訂單金額異常，請聯絡客服" };
    }

    const metadata: Stripe.MetadataParam = {
      order_kind: "member_auth",
      capture_mode: "manual",
      escrow_capture_model: AUTH_ESCROW_CAPTURE_MODEL_SINGLE,
      order_id: prepared.order_id,
      order_number: row.order_number ?? "",
      buyer_id: user.id,
      seller_id: prepared.seller_id,
      listing_id: prepared.listing_id,
      item_subtotal: String(prepared.item_subtotal),
      auth_fee: String(prepared.auth_fee),
      inbound_shipping_fee: String(prepared.inbound_shipping_fee),
      outbound_shipping_fee: String(prepared.outbound_shipping_fee),
      total_amount: String(prepared.total_amount),
      buyer_total_amount: String(prepared.buyer_total_amount),
      platform_subsidy_amount: String(prepared.platform_subsidy_amount),
    };

    let paymentIntent: Stripe.PaymentIntent | null = null;

    if (prepared.stripe_payment_intent_id) {
      try {
        const existing = await stripe.paymentIntents.retrieve(
          prepared.stripe_payment_intent_id,
        );

        if (
          existing.status === "succeeded" ||
          existing.status === "processing"
        ) {
          return {
            success: false,
            error: "此訂單已在付款處理中，請稍候或重新載入訂單狀態",
          };
        }

        if (existing.status === "requires_capture") {
          paymentIntent = existing;
        } else if (existing.status !== "canceled") {
          paymentIntent = await stripe.paymentIntents.update(existing.id, {
            amount: amountInCents,
            metadata,
            capture_method: "manual",
          });
        }
      } catch (retrieveError) {
        const stripeCode =
          typeof retrieveError === "object" &&
          retrieveError !== null &&
          "code" in retrieveError
            ? String((retrieveError as { code?: string }).code)
            : null;
        if (stripeCode !== "resource_missing") {
          throw retrieveError;
        }
      }
    }

    if (!paymentIntent) {
      paymentIntent = await stripe.paymentIntents.create({
        amount: amountInCents,
        currency: "hkd",
        capture_method: "manual",
        automatic_payment_methods: { enabled: true },
        metadata,
      });
    }

    const { error: attachError } = await asMemberAuthCheckoutRpcClient(
      supabase,
    ).rpc("rpc_attach_member_auth_order_payment_intent", {
      p_order_id: prepared.order_id,
      p_payment_intent_id: paymentIntent.id,
    });

    if (attachError) {
      console.error(
        "[createMemberAuthPaymentIntent] attach",
        attachError.message,
      );
      return { success: false, error: attachError.message };
    }

    if (!paymentIntent.client_secret) {
      return { success: false, error: "無法取得付款憑證，請重試" };
    }

    return {
      success: true,
      data: {
        orderId: prepared.order_id,
        clientSecret: paymentIntent.client_secret,
        publishableKey,
        itemSubtotal: prepared.item_subtotal,
        authFee: prepared.auth_fee,
        inboundShippingFee: prepared.inbound_shipping_fee,
        outboundShippingFee: prepared.outbound_shipping_fee,
        totalAmount: prepared.total_amount,
        buyerTotalAmount: prepared.buyer_total_amount,
        platformSubsidyAmount: prepared.platform_subsidy_amount,
      },
    };
  } catch (error) {
    console.error("[createMemberAuthPaymentIntent]", error);
    const message =
      error instanceof Error ? error.message : "建立付款時發生錯誤";
    return { success: false, error: message };
  }
}

/** 付款後輪詢：webhook 非同步，確認是否已進入 custody。 */
export async function getMemberAuthPaymentStatus(
  orderIdOrNumber: string,
): Promise<ActionResult<MemberAuthPaymentStatus>> {
  if (!isSupabaseConfigured()) {
    return { success: false, error: "未登入" };
  }

  try {
    const auth = await requireActiveAuthUser();
    if (!auth.ok) {
      return { success: false, error: auth.error };
    }
    const { user, supabase } = auth;

    const rowResult = await loadMemberAuthCheckoutRow(
      supabase,
      orderIdOrNumber,
      user.id,
    );
    if (!rowResult.success) {
      return rowResult;
    }

    const row = rowResult.data;

    return {
      success: true,
      data: {
        orderId: row.id,
        orderNumber: row.order_number,
        escrowStatus: row.escrow_status,
        paymentConfirmedAt: row.payment_confirmed_at,
        paymentCaptureStatus: row.payment_capture_status ?? null,
        totalAmount: Number(
          row.buyer_total_amount ??
            row.total_amount ??
            calculateMemberAuthPaymentTotal(Number(row.final_price)),
        ),
      },
    };
  } catch (error) {
    console.error("[getMemberAuthPaymentStatus]", error);
    return { success: false, error: "查詢付款狀態時發生錯誤" };
  }
}

/** Client 判斷是否應顯示 Stripe Payment Element（非 secret，僅 publishable key）。 */
export async function isMemberAuthStripePaymentAvailable(): Promise<boolean> {
  return Boolean(getStripePublishableKey());
}
