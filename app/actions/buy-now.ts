"use server";

import { revalidatePath } from "next/cache";
import { revalidateHomeListingsCache } from "@/lib/home/revalidate-home-listings";
import { getCurrentUserProfile } from "@/app/actions/profile";
import { resolveMerchantPayoutReadyForClient } from "@/lib/stripe/payout-ready";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { requireActiveAuthUser } from "@/lib/auth/mutation-guard";
import { createClient } from "@/lib/supabase/server";
import { enqueueB2cAwaitingPaymentBuyerEmail } from "@/lib/notifications/grading-emails";
import {
  enqueueBuyNowSellerEmail,
  enqueueOfferExpiredEmailsForListing,
} from "@/lib/notifications/offer-emails";
import { sendBuyNowSellerPush } from "@/lib/notifications/offer-push";
import { enqueueP2pMeetupArrangedEmails } from "@/lib/notifications/p2p-order-emails";
import type { Tables } from "@/types/supabase";

type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

export type BuyNowListingPayload = {
  orderId: string;
  orderNumber: string | null;
  orderKind: "merchant" | "member";
  roomId: string;
  offerId: string;
  offerMessage: {
    id: string;
    content: string;
    created_at: string | null;
  };
  acceptedMessageId: string | null;
  partnerPersona: "merchant" | "member";
  sellerId: string;
  sellerName: string;
  buyerId: string;
  buyerName: string;
  cardName: string;
  productId: string;
  listingId: string;
  offerPrice: number;
  useAuthentication: boolean;
  paymentHref: string | null;
  checkoutHref: string | null;
  orderDetailHref: string;
};

type BuyNowRpcRow = {
  room: Tables<"chat_rooms">;
  offer: Tables<"offers">;
  offer_message: Tables<"chat_messages">;
  accepted_message: Tables<"chat_messages"> | null;
  order: Tables<"merchant_orders"> | Tables<"member_orders">;
  order_kind: string;
};

type BuyNowRpcClient = {
  rpc(
    fn: "rpc_buy_now_listing",
    args: {
      p_listing_id: string;
      p_buyer_id: string;
      p_use_auth: boolean;
    },
  ): Promise<{ data: unknown; error: { message: string } | null }>;
};

function asBuyNowRpcClient(client: Awaited<ReturnType<typeof createClient>>) {
  return client as unknown as BuyNowRpcClient;
}

function parseBuyNowRpcPayload(data: unknown): BuyNowRpcRow | null {
  if (!data || typeof data !== "object") {
    return null;
  }
  const payload = data as Record<string, unknown>;
  if (
    !payload.room ||
    typeof payload.room !== "object" ||
    !payload.offer ||
    typeof payload.offer !== "object" ||
    !payload.offer_message ||
    typeof payload.offer_message !== "object" ||
    !payload.order ||
    typeof payload.order !== "object" ||
    typeof payload.order_kind !== "string"
  ) {
    return null;
  }
  return {
    room: payload.room as Tables<"chat_rooms">,
    offer: payload.offer as Tables<"offers">,
    offer_message: payload.offer_message as Tables<"chat_messages">,
    accepted_message:
      payload.accepted_message && typeof payload.accepted_message === "object"
        ? (payload.accepted_message as Tables<"chat_messages">)
        : null,
    order: payload.order as Tables<"merchant_orders"> | Tables<"member_orders">,
    order_kind: payload.order_kind,
  };
}

function resolvePaymentHref(
  orderKind: "merchant" | "member",
  orderId: string,
  order: Tables<"merchant_orders"> | Tables<"member_orders">,
): string | null {
  if (orderKind === "merchant") {
    const merchantOrder = order as Tables<"merchant_orders">;
    if (merchantOrder.escrow_status === "pending_payment") {
      return `/checkout/${orderId}`;
    }
    return null;
  }

  const memberOrder = order as Tables<"member_orders">;
  if (
    memberOrder.use_authentication &&
    memberOrder.escrow_status === "payment" &&
    memberOrder.payment_confirmed_at == null
  ) {
    return `/checkout/${orderId}`;
  }
  return null;
}

async function resolveSellerDisplayName(
  supabase: Awaited<ReturnType<typeof createClient>>,
  sellerId: string,
  sellerPersona: Tables<"listings">["seller_persona"],
): Promise<string> {
  if (sellerPersona === "merchant") {
    const { data: shop } = await supabase
      .from("merchant_shops")
      .select("shop_name, shop_handle")
      .eq("merchant_id", sellerId)
      .maybeSingle<Pick<Tables<"merchant_shops">, "shop_name" | "shop_handle">>();
    return (
      shop?.shop_name?.trim() ||
      shop?.shop_handle?.trim() ||
      "認證商戶"
    );
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, username")
    .eq("id", sellerId)
    .maybeSingle<Pick<Tables<"profiles">, "display_name" | "username">>();

  return (
    profile?.display_name?.trim() ||
    profile?.username?.trim() ||
    "賣家"
  );
}

/** 一口價立即購買：以掛單開價自動成交並建立 chat + 訂單（商戶 / 會員 P2P）。 */
export async function buyNowListing(
  listingId: string,
  useAuth = false,
): Promise<ActionResult<BuyNowListingPayload>> {
  const trimmedListingId = listingId.trim();
  if (!trimmedListingId) {
    return { success: false, error: "找不到此商品掛單" };
  }

  if (!isSupabaseConfigured()) {
    return { success: false, error: "未登入" };
  }

  try {
    const auth = await requireActiveAuthUser();
    if (!auth.ok) {
      return { success: false, error: auth.error };
    }
    const { user, supabase } = auth;

    const { data: listing, error: listingError } = await supabase
      .from("listings")
      .select(
        `
          seller_id,
          seller_persona,
          product_id,
          product_catalog (
            name_zh,
            name_ja
          )
        `,
      )
      .eq("id", trimmedListingId)
      .maybeSingle<{
        seller_id: string;
        seller_persona: Tables<"listings">["seller_persona"];
        product_id: string;
        product_catalog: {
          name_zh: string | null;
          name_ja: string;
        } | null;
      }>();

    if (listingError || !listing) {
      return { success: false, error: "找不到此商品掛單" };
    }

    const sellerPersona = listing.seller_persona ?? "member";

    if (sellerPersona === "merchant") {
      const payoutReady = await resolveMerchantPayoutReadyForClient(
        supabase,
        listing.seller_id,
      );
      if (!payoutReady) {
        return {
          success: false,
          error: "此商戶尚未完成收款設定，暫時無法直接購買",
        };
      }
    }

    const { data, error } = await asBuyNowRpcClient(supabase).rpc(
      "rpc_buy_now_listing",
      {
        p_listing_id: trimmedListingId,
        p_buyer_id: user.id,
        p_use_auth: useAuth,
      },
    );

    if (error) {
      console.error("[buyNowListing] rpc", error.message);
      return { success: false, error: error.message };
    }

    const parsed = parseBuyNowRpcPayload(data);
    if (!parsed) {
      console.error("[buyNowListing] invalid rpc payload", data);
      return { success: false, error: "建立訂單回傳資料格式異常" };
    }

    const orderKind =
      parsed.order_kind === "merchant" ? "merchant" : "member";
    const orderId = parsed.order.id;
    const orderNumber =
      "order_number" in parsed.order
        ? (parsed.order.order_number as string | null)
        : null;

    const profileResult = await getCurrentUserProfile();
    if (!profileResult.success) {
      return { success: false, error: profileResult.error };
    }

    const catalog = listing.product_catalog;
    const cardName =
      catalog?.name_zh?.trim() ||
      catalog?.name_ja?.trim() ||
      "未知商品";

    const sellerName = await resolveSellerDisplayName(
      supabase,
      listing.seller_id,
      sellerPersona,
    );

    const paymentHref = resolvePaymentHref(orderKind, orderId, parsed.order);
    const orderDetailHref = `/profile/user/orderDetail/${orderId}`;

    revalidatePath("/marketplace");
    revalidateHomeListingsCache();
    revalidatePath("/profile/user/trading");
    revalidatePath("/profile/merchant/trading");

    await enqueueBuyNowSellerEmail({
      offerId: parsed.offer.id,
      listingId: trimmedListingId,
      sellerId: listing.seller_id,
      buyerId: user.id,
      orderId,
      offerPrice: Number(parsed.offer.offer_price),
    });

    await sendBuyNowSellerPush({
      listingId: trimmedListingId,
      sellerId: listing.seller_id,
      buyerId: user.id,
      orderId,
      offerPrice: Number(parsed.offer.offer_price),
    });

    await enqueueOfferExpiredEmailsForListing({
      listingId: trimmedListingId,
      reason: "order_created_elsewhere",
      excludeOfferIds: [parsed.offer.id],
    });

    if (orderKind === "merchant" && useAuth) {
      await enqueueB2cAwaitingPaymentBuyerEmail(orderId);
    } else if (orderKind === "member") {
      const memberOrder = parsed.order as Tables<"member_orders">;
      if (!memberOrder.use_authentication) {
        await enqueueP2pMeetupArrangedEmails({
          orderId,
          buyerId: user.id,
          sellerId: listing.seller_id,
          listingId: trimmedListingId,
          orderNumber,
          sellerPersona: sellerPersona === "merchant" ? "merchant" : "member",
        });
      }
    }

    return {
      success: true,
      data: {
        orderId,
        orderNumber,
        orderKind,
        roomId: parsed.room.id,
        offerId: parsed.offer.id,
        offerMessage: {
          id: parsed.offer_message.id,
          content: parsed.offer_message.content,
          created_at: parsed.offer_message.created_at,
        },
        acceptedMessageId: parsed.accepted_message?.id ?? null,
        partnerPersona: sellerPersona === "merchant" ? "merchant" : "member",
        sellerId: listing.seller_id,
        sellerName,
        buyerId: user.id,
        buyerName: profileResult.data.displayName,
        cardName,
        productId: listing.product_id,
        listingId: trimmedListingId,
        offerPrice: Number(parsed.offer.offer_price),
        useAuthentication: Boolean(parsed.offer.use_authentication),
        paymentHref,
        checkoutHref: paymentHref ?? null,
        orderDetailHref,
      },
    };
  } catch (error) {
    console.error("[buyNowListing]", error);
    return { success: false, error: "建立訂單時發生錯誤" };
  }
}
