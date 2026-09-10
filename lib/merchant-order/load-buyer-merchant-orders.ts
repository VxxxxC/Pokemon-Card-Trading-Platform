import { resolveOfferCardDisplayImage } from "@/app/lib/chat/offerCardImage";
import type { UserTradingOrder } from "@/app/actions/orders";
import { computeMerchantPaymentExpiresAt } from "@/lib/merchant-checkout/pending-payment-expiry";
import {
  getMerchantBuyerActionFlags,
  mapMerchantEscrowToMemberEscrowStatus,
} from "@/lib/merchant-order/buyer-actions";
import {
  isOpenMerchantBuyerOrder,
  mapMerchantEscrowToMemberStatus,
} from "@/lib/merchant-order/merchant-order-rpc";
import { resolveAvatarUrl } from "@/lib/profile/avatar";
import type { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/types/supabase";

type ServerSupabaseClient = Awaited<ReturnType<typeof createClient>>;

type MerchantBuyerOrderRow = Pick<
  Tables<"merchant_orders">,
  | "id"
  | "order_number"
  | "buyer_id"
  | "merchant_id"
  | "final_price"
  | "escrow_status"
  | "requires_authentication"
  | "created_at"
  | "outbound_tracking_no"
  | "payment_capture_status"
  | "auth_result"
  | "shipping_method"
  | "buyer_confirmed_at"
  | "payout_status"
  | "payout_hold_until"
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

type MerchantShopSnippet = Pick<
  Tables<"merchant_shops">,
  "merchant_id" | "shop_name" | "shop_handle" | "shop_avatar_path"
>;

function displayCardName(row: {
  name_ja: string;
  name_zh: string | null;
  name_en: string | null;
}): string {
  return row.name_zh?.trim() || row.name_en?.trim() || row.name_ja?.trim() || "未知商品";
}

export async function loadBuyerMerchantTradingOrders(
  supabase: ServerSupabaseClient,
  userId: string,
  reviewedOrderIds: ReadonlySet<string>,
): Promise<UserTradingOrder[]> {
  const { data, error } = await supabase
    .from("merchant_orders")
    .select(
      `
      id,
      order_number,
      buyer_id,
      merchant_id,
      final_price,
      escrow_status,
      requires_authentication,
      created_at,
      outbound_tracking_no,
      payment_capture_status,
      auth_result,
      shipping_method,
      buyer_confirmed_at,
      payout_status,
      payout_hold_until,
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
    `,
    )
    .eq("buyer_id", userId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[loadBuyerMerchantTradingOrders]", error.message);
    return [];
  }

  const rows = (data ?? []) as MerchantBuyerOrderRow[];
  const merchantIds = [...new Set(rows.map((row) => row.merchant_id))];
  const shopsByMerchantId = new Map<string, MerchantShopSnippet>();

  if (merchantIds.length > 0) {
    const { data: shops, error: shopsError } = await supabase
      .from("merchant_shops")
      .select("merchant_id, shop_name, shop_handle, shop_avatar_path")
      .in("merchant_id", merchantIds);

    if (shopsError) {
      console.error(
        "[loadBuyerMerchantTradingOrders] merchant_shops",
        shopsError.message,
      );
    } else {
      for (const shop of (shops ?? []) as MerchantShopSnippet[]) {
        shopsByMerchantId.set(shop.merchant_id, shop);
      }
    }
  }

  return rows.map((row) => {
    const catalog = row.listings?.product_catalog;
    const shop = shopsByMerchantId.get(row.merchant_id);
    const createdAt = row.created_at ?? new Date().toISOString();
    const expiresAt = new Date(
      new Date(createdAt).getTime() + 14 * 24 * 60 * 60 * 1000,
    ).toISOString();
    const useAuthentication = Boolean(row.requires_authentication);
    const buyerFlags = getMerchantBuyerActionFlags({
      escrowStatus: row.escrow_status,
      requiresAuthentication: useAuthentication,
      shippingMethod: row.shipping_method,
      buyerConfirmedAt: row.buyer_confirmed_at,
      outboundTrackingNo: row.outbound_tracking_no,
      authResult: row.auth_result,
      paymentCaptureStatus: row.payment_capture_status,
    });

    const pendingPayment = row.escrow_status === "pending_payment";
    const paymentExpiresAt = pendingPayment
      ? computeMerchantPaymentExpiresAt(createdAt)
      : null;

    return {
      id: row.id,
      orderKind: "merchant",
      orderNumber: row.order_number,
      buyerId: row.buyer_id,
      sellerId: row.merchant_id,
      finalPrice: Number(row.final_price),
      status: mapMerchantEscrowToMemberStatus(
        row.escrow_status,
        row.buyer_confirmed_at,
      ),
      createdAt: row.created_at,
      expiresAt,
      persona: "buy",
      hasReviewedByMe: reviewedOrderIds.has(row.id),
      useAuthentication,
      escrowStatus: mapMerchantEscrowToMemberEscrowStatus(
        row.escrow_status,
        useAuthentication,
        row.buyer_confirmed_at,
      ),
      pendingPayment,
      paymentExpiresAt,
      canCompleteMerchantPurchase: buyerFlags.canCompleteMerchantPurchase,
      shippingMethod: row.shipping_method,
      merchantEscrowStatus: row.escrow_status,
      merchantPayoutStatus: row.payout_status,
      buyerConfirmedAt: row.buyer_confirmed_at,
      payoutHoldUntil: row.payout_hold_until,
      counterparty: {
        id: row.merchant_id,
        displayName:
          shop?.shop_name?.trim() || "認證商戶",
        username: shop?.shop_handle?.trim() || null,
        avatarUrl: resolveAvatarUrl(shop?.shop_avatar_path),
      },
      listing: {
        gradingCompany: row.listings?.grading_company ?? "",
        gradingScore: row.listings?.grading_score ?? null,
        useAuthentication: Boolean(row.requires_authentication),
      },
      product: {
        cardName: catalog
          ? displayCardName(catalog)
          : "未知商品",
        cardNumber: catalog?.card_number ?? null,
        setCode: catalog?.set_code ?? "",
        displayId: catalog?.display_id ?? null,
        imageUrl: resolveOfferCardDisplayImage(
          row.listings?.images,
          catalog?.image_url,
        ),
      },
    } satisfies UserTradingOrder;
  });
}

export function merchantBuyerOrderMatchesTab(
  order: UserTradingOrder,
  tabStatus: "all" | "pending" | "completed" | "cancelled",
): boolean {
  if (tabStatus === "all") {
    return true;
  }

  const escrow = order.status;
  if (tabStatus === "pending") {
    return order.status === "pending";
  }
  if (tabStatus === "completed") {
    return order.status === "completed";
  }
  if (tabStatus === "cancelled") {
    return order.status === "cancelled";
  }

  return escrow === tabStatus;
}

export function merchantBuyerOrderIsOpen(order: UserTradingOrder): boolean {
  return order.status === "pending";
}

export { isOpenMerchantBuyerOrder };
