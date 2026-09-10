"use server";

import { revalidatePath } from "next/cache";
import { revalidateHomeListingsCache } from "@/lib/home/revalidate-home-listings";
import { createClient } from "@/lib/supabase/server";
import {
  resolveOfferCardDisplayImage,
} from "@/app/lib/chat/offerCardImage";
import { parseListingImageUrls } from "@/lib/listings/images";
import { requireActiveAuthUser } from "@/lib/auth/mutation-guard";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { SELF_OFFER_ERROR_MESSAGE } from "@/lib/auth/dual-persona";
import {
  formatAuthOfferMessageContent,
  formatStandardOfferMessageContent,
} from "@/lib/listings/auth-service-copy";
import { fetchPlatformAuthFeeHkd } from "@/lib/platform/resolve-display-auth-fee";
import { formatListingGrade } from "@/lib/marketplace/listing-display";
import type { Tables } from "@/types/supabase";
import type { MemberOrderKind } from "@/lib/member-order/order-kind";
import {
  enqueueOfferAcceptedEmail,
  enqueueOfferExpiredEmailsForListing,
  enqueueOfferModifiedEmail,
  enqueueOfferReceivedEmail,
  enqueueOfferRejectedEmail,
} from "@/lib/notifications/offer-emails";
import {
  sendOfferAcceptedPush,
  sendOfferReceivedPush,
  sendOfferRejectedPush,
} from "@/lib/notifications/offer-push";
import { enqueueP2pMeetupArrangedEmails } from "@/lib/notifications/p2p-order-emails";

type ChatRoomRow = Tables<"chat_rooms">;
type OfferRow = Tables<"offers">;
type ChatMessageRow = Tables<"chat_messages">;
type MemberOrderRow = Tables<"member_orders">;
type MerchantOrderRow = Tables<"merchant_orders">;

type RpcMakeOfferArgs = {
  p_listing_id: string;
  p_buyer_id: string;
  p_offer_price: number;
  p_content: string;
  p_use_authentication: boolean;
};

type RpcMakeOfferPayload = {
  room: ChatRoomRow;
  offer: OfferRow;
  message: ChatMessageRow;
};

export type MakeOfferResult =
  | {
      success: true;
      data: RpcMakeOfferPayload;
    }
  | { success: false; error: string };

type RpcAcceptOfferArgs = {
  p_offer_id: string;
  p_seller_id: string;
};

type AcceptOfferPayload = {
  orderKind: MemberOrderKind;
  order: MemberOrderRow | MerchantOrderRow;
  messageId: string;
};

export type AcceptOfferResult =
  | {
      success: true;
      data: AcceptOfferPayload;
    }
  | { success: false; error: string };

type RpcModifyOfferArgs = {
  p_offer_id: string;
  p_buyer_id: string;
  p_new_price: number;
  p_content: string;
};

type ModifyOfferPayload = {
  offer: OfferRow;
  messageId: string;
};

export type ModifyOfferResult =
  | {
      success: true;
      data: ModifyOfferPayload;
    }
  | { success: false; error: string };

type RpcRejectOfferArgs = {
  p_offer_id: string;
  p_seller_id: string;
};

type RejectOfferPayload = {
  offer: OfferRow;
  messageId: string;
};

export type RejectOfferResult =
  | {
      success: true;
      data: RejectOfferPayload;
    }
  | { success: false; error: string };

export type OfferCardOfferState = {
  id: string;
  buyer_id: string;
  offer_price: number;
  status: Tables<"offers">["status"];
  modified_count: number;
  room_id: string;
  use_authentication: boolean;
};

export type OfferCardContext = {
  offer: OfferCardOfferState;
  listingId: string;
  productId: string;
  cardName: string;
  cardNumber: string | null;
  setCode: string;
  displayId: string | null;
  gradeAuthority?: string;
  gradeScore?: string | null;
  imageUrl?: string;
  listingImageUrls?: string[];
  buyerName: string;
  sellerId: string;
  authServiceFeeHkd: number;
  orderId?: string | null;
  orderKind?: "merchant" | "member";
  pendingPayment?: boolean;
  canPayAuth?: boolean;
  paymentHref?: string | null;
  orderDetailHref?: string | null;
};

export type GetOfferCardContextResult =
  | { success: true; data: OfferCardContext }
  | { success: false; error: string };

export type BatchGetOfferCardContextsResult =
  | { success: true; data: Record<string, OfferCardContext> }
  | { success: false; error: string };

type OfferCardQueryRow = {
  id: string;
  buyer_id: string;
  offer_price: number;
  status: Tables<"offers">["status"];
  modified_count?: number | null;
  room_id: string;
  listing_id: string;
  use_authentication: boolean;
  listings: {
    id: string;
    product_id: string;
    images: unknown;
    grading_company: string;
    grading_score: string | null;
    product_catalog: {
      id: string;
      name_zh: string | null;
      name_ja: string;
      card_number: string | null;
      set_code: string;
      display_id: string | null;
      image_url: string;
    };
  };
  chat_rooms: {
    seller_id: string;
  };
};

function readModifiedCount(offer: {
  modified_count?: number | null;
}): number {
  const value = offer.modified_count;
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

async function resolveAcceptedOfferOrderContext(
  supabase: Awaited<ReturnType<typeof createClient>>,
  offerId: string,
  offerStatus: Tables<"offers">["status"],
): Promise<
  Pick<
    OfferCardContext,
    | "orderId"
    | "orderKind"
    | "pendingPayment"
    | "canPayAuth"
    | "paymentHref"
    | "orderDetailHref"
  >
> {
  if (offerStatus !== "accepted") {
    return {};
  }

  const { data: acceptedMessage } = await supabase
    .from("chat_messages")
    .select("merchant_order_id, member_order_id")
    .eq("offer_id", offerId)
    .eq("content", "SYSTEM_OFFER_ACCEPTED")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<{
      merchant_order_id: string | null;
      member_order_id: string | null;
    }>();

  const merchantOrderId = acceptedMessage?.merchant_order_id?.trim();
  const memberOrderId = acceptedMessage?.member_order_id?.trim();

  if (merchantOrderId) {
    const { data: order } = await supabase
      .from("merchant_orders")
      .select("escrow_status")
      .eq("id", merchantOrderId)
      .maybeSingle<Pick<Tables<"merchant_orders">, "escrow_status">>();

    const pendingPayment = order?.escrow_status === "pending_payment";
    const paymentHref = pendingPayment
      ? `/checkout/${merchantOrderId}`
      : null;

    return {
      orderId: merchantOrderId,
      orderKind: "merchant",
      pendingPayment,
      paymentHref,
      orderDetailHref: `/profile/user/orderDetail/${merchantOrderId}`,
    };
  }

  if (memberOrderId) {
    const { data: order } = await supabase
      .from("member_orders")
      .select(
        "escrow_status, use_authentication, status, payment_confirmed_at",
      )
      .eq("id", memberOrderId)
      .maybeSingle<
        Pick<
          Tables<"member_orders">,
          | "escrow_status"
          | "use_authentication"
          | "status"
          | "payment_confirmed_at"
        >
      >();

    const canPayAuth =
      Boolean(order?.use_authentication) &&
      order?.escrow_status === "payment" &&
      order?.payment_confirmed_at == null;
    const paymentHref = canPayAuth
      ? `/checkout/${memberOrderId}`
      : null;

    return {
      orderId: memberOrderId,
      orderKind: "member",
      canPayAuth,
      paymentHref,
      orderDetailHref: `/profile/user/orderDetail/${memberOrderId}`,
    };
  }

  return {};
}

async function buildOfferCardContextFromRow(
  supabase: Awaited<ReturnType<typeof createClient>>,
  data: OfferCardQueryRow,
  buyerName: string,
  authServiceFeeHkd: number,
): Promise<OfferCardContext | null> {
  const listing = data.listings;
  const catalog = listing?.product_catalog;
  if (!catalog || !data.listing_id) {
    return null;
  }

  const cardName =
    catalog.name_zh?.trim() || catalog.name_ja?.trim() || "未命名卡牌";
  const { authority: gradeAuthority, score: gradeScore } = formatListingGrade(
    listing.grading_company,
    listing.grading_score,
  );

  const orderContext = await resolveAcceptedOfferOrderContext(
    supabase,
    data.id,
    data.status,
  );

  return {
    offer: {
      id: data.id,
      buyer_id: data.buyer_id,
      offer_price: Number(data.offer_price),
      status: data.status,
      modified_count: readModifiedCount(data),
      room_id: data.room_id,
      use_authentication: data.use_authentication,
    },
    listingId: listing.id,
    productId: catalog.id,
    cardName,
    cardNumber: catalog.card_number,
    setCode: catalog.set_code,
    displayId: catalog.display_id,
    gradeAuthority,
    gradeScore: gradeScore || null,
    listingImageUrls: parseListingImageUrls(listing.images),
    imageUrl: resolveOfferCardDisplayImage(listing.images, catalog.image_url),
    buyerName,
    sellerId: data.chat_rooms.seller_id,
    authServiceFeeHkd,
    ...orderContext,
  };
}

function formatModifyOfferMessageContent(newPrice: number): string {
  return `修改了出價需求：HK$ ${newPrice.toLocaleString()}`;
}

function validateOfferPrice(offerPrice: number): string | null {
  if (!Number.isFinite(offerPrice) || offerPrice <= 0) {
    return "請輸入有效的出價金額";
  }
  return null;
}

function parseRpcMakeOfferPayload(data: unknown): RpcMakeOfferPayload | null {
  if (!data || typeof data !== "object") {
    return null;
  }

  const payload = data as Record<string, unknown>;

  if (
    !payload.room ||
    typeof payload.room !== "object" ||
    !payload.offer ||
    typeof payload.offer !== "object" ||
    !payload.message ||
    typeof payload.message !== "object"
  ) {
    return null;
  }

  return {
    room: payload.room as ChatRoomRow,
    offer: payload.offer as OfferRow,
    message: payload.message as ChatMessageRow,
  };
}

function parseRpcAcceptOfferPayload(data: unknown): AcceptOfferPayload | null {
  if (!data || typeof data !== "object") {
    return null;
  }

  const payload = data as Record<string, unknown>;

  if (!payload.order || typeof payload.order !== "object") {
    return null;
  }

  if (typeof payload.message_id !== "string") {
    return null;
  }

  const orderKind =
    payload.order_kind === "merchant" ? "merchant" : "member";

  return {
    orderKind,
    order: payload.order as MemberOrderRow | MerchantOrderRow,
    messageId: payload.message_id,
  };
}

function parseRpcModifyOfferPayload(data: unknown): ModifyOfferPayload | null {
  if (!data || typeof data !== "object") {
    return null;
  }

  const payload = data as Record<string, unknown>;

  if (!payload.offer || typeof payload.offer !== "object") {
    return null;
  }

  if (typeof payload.message_id !== "string") {
    return null;
  }

  return {
    offer: payload.offer as OfferRow,
    messageId: payload.message_id,
  };
}

function parseRpcRejectOfferPayload(data: unknown): RejectOfferPayload | null {
  if (!data || typeof data !== "object") {
    return null;
  }

  const payload = data as Record<string, unknown>;

  if (!payload.offer || typeof payload.offer !== "object") {
    return null;
  }

  if (typeof payload.message_id !== "string") {
    return null;
  }

  return {
    offer: payload.offer as OfferRow,
    messageId: payload.message_id,
  };
}

export async function getOfferCardContext(
  offerId: string,
): Promise<GetOfferCardContextResult> {
  const trimmedOfferId = offerId.trim();
  if (!trimmedOfferId) {
    return { success: false, error: "找不到此出價紀錄" };
  }

  if (!isSupabaseConfigured()) {
    return { success: false, error: "服務尚未設定" };
  }

  try {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("offers")
      .select(
        `
          id,
          buyer_id,
          offer_price,
          status,
          modified_count,
          room_id,
          listing_id,
          use_authentication,
          listings!inner (
            id,
            product_id,
            images,
            grading_company,
            grading_score,
            product_catalog!inner (
              id,
              name_zh,
              name_ja,
              card_number,
              set_code,
              display_id,
              image_url
            )
          ),
          chat_rooms!inner (
            seller_id
          )
        `,
      )
      .eq("id", trimmedOfferId)
      .maybeSingle<OfferCardQueryRow>();

    if (error) {
      console.error("[getOfferCardContext]", error.message);
      return { success: false, error: "無法載入出價資料" };
    }

    if (!data?.listings?.product_catalog || !data.listing_id) {
      return { success: false, error: "找不到此出價紀錄" };
    }

    const { data: buyerProfile, error: buyerError } = await supabase
      .from("profiles")
      .select("display_name")
      .eq("id", data.buyer_id)
      .maybeSingle<{ display_name: string }>();

    if (buyerError) {
      console.error("[getOfferCardContext] buyer profile", buyerError.message);
    }

    const authServiceFeeHkd = await fetchPlatformAuthFeeHkd();
    const context = await buildOfferCardContextFromRow(
      supabase,
      data,
      buyerProfile?.display_name?.trim() || "買家",
      authServiceFeeHkd,
    );

    if (!context) {
      return { success: false, error: "找不到此出價紀錄" };
    }

    return { success: true, data: context };
  } catch (error) {
    console.error("[getOfferCardContext]", error);
    return { success: false, error: "載入出價卡片時發生錯誤" };
  }
}

export async function batchGetOfferCardContexts(
  offerIds: string[],
): Promise<BatchGetOfferCardContextsResult> {
  const uniqueIds = [...new Set(offerIds.map((id) => id.trim()).filter(Boolean))];
  if (uniqueIds.length === 0) {
    return { success: true, data: {} };
  }

  if (!isSupabaseConfigured()) {
    return { success: false, error: "服務尚未設定" };
  }

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: "請先登入" };
    }

    const { data: rows, error } = await supabase
      .from("offers")
      .select(
        `
          id,
          buyer_id,
          offer_price,
          status,
          modified_count,
          room_id,
          listing_id,
          use_authentication,
          listings!inner (
            id,
            product_id,
            images,
            grading_company,
            grading_score,
            product_catalog!inner (
              id,
              name_zh,
              name_ja,
              card_number,
              set_code,
              display_id,
              image_url
            )
          ),
          chat_rooms!inner (
            seller_id
          )
        `,
      )
      .in("id", uniqueIds);

    if (error) {
      console.error("[batchGetOfferCardContexts]", error.message);
      return { success: false, error: "無法載入出價資料" };
    }

    const offerRows = (rows ?? []) as OfferCardQueryRow[];
    if (offerRows.length === 0) {
      return { success: true, data: {} };
    }

    const buyerIds = [...new Set(offerRows.map((row) => row.buyer_id))];
    const { data: buyerProfiles, error: buyerError } = await supabase
      .from("profiles")
      .select("id, display_name")
      .in("id", buyerIds)
      .returns<{ id: string; display_name: string }[]>();

    if (buyerError) {
      console.error("[batchGetOfferCardContexts] buyer profiles", buyerError.message);
    }

    const buyerNameById = new Map(
      (buyerProfiles ?? []).map((profile) => [
        profile.id,
        profile.display_name?.trim() || "買家",
      ]),
    );

    const authServiceFeeHkd = await fetchPlatformAuthFeeHkd();
    const data: Record<string, OfferCardContext> = {};

    for (const row of offerRows) {
      const context = await buildOfferCardContextFromRow(
        supabase,
        row,
        buyerNameById.get(row.buyer_id) ?? "買家",
        authServiceFeeHkd,
      );
      if (context) {
        data[row.id] = context;
      }
    }

    return { success: true, data };
  } catch (error) {
    console.error("[batchGetOfferCardContexts]", error);
    return { success: false, error: "載入出價卡片時發生錯誤" };
  }
}

export type BuyerPendingOfferForListingResult =
  | {
      success: true;
      data: { offerId: string; offerPrice: number } | null;
    }
  | { success: false; error: string };

export async function getBuyerPendingOfferForListing(
  listingId: string,
): Promise<BuyerPendingOfferForListingResult> {
  const trimmedListingId = listingId.trim();
  if (!trimmedListingId) {
    return { success: false, error: "缺少掛單識別碼" };
  }

  if (!isSupabaseConfigured()) {
    return { success: false, error: "未登入" };
  }

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { success: true, data: null };
    }

    const { data, error } = await supabase
      .from("offers")
      .select("id, offer_price")
      .eq("listing_id", trimmedListingId)
      .eq("buyer_id", user.id)
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle<Pick<Tables<"offers">, "id" | "offer_price">>();

    if (error) {
      console.error("[getBuyerPendingOfferForListing]", error.message);
      return { success: false, error: "無法載入出價狀態" };
    }

    if (!data) {
      return { success: true, data: null };
    }

    return {
      success: true,
      data: {
        offerId: data.id,
        offerPrice: Number(data.offer_price),
      },
    };
  } catch (error) {
    console.error("[getBuyerPendingOfferForListing]", error);
    return { success: false, error: "無法載入出價狀態" };
  }
}

export async function makeOffer(
  listingId: string,
  offerPrice: number,
  useAuthentication = false,
): Promise<MakeOfferResult> {
  const trimmedListingId = listingId.trim();
  if (!trimmedListingId) {
    return { success: false, error: "找不到此商品掛單" };
  }

  const priceError = validateOfferPrice(offerPrice);
  if (priceError) {
    return { success: false, error: priceError };
  }

  try {
    const guard = await requireActiveAuthUser();
    if (!guard.ok) {
      return { success: false, error: guard.error };
    }
    const { user, supabase } = guard;

    const { data: listing, error: listingError } = await supabase
      .from("listings")
      .select("seller_id")
      .eq("id", trimmedListingId)
      .maybeSingle<Pick<Tables<"listings">, "seller_id">>();

    if (listingError) {
      console.error("[makeOffer] listing lookup", listingError.message);
      return { success: false, error: "找不到此商品掛單" };
    }

    if (!listing) {
      return { success: false, error: "找不到此商品掛單" };
    }

    if (listing.seller_id === user.id) {
      return { success: false, error: SELF_OFFER_ERROR_MESSAGE };
    }

    const authServiceFeeHkd = useAuthentication
      ? await fetchPlatformAuthFeeHkd()
      : 0;

    const rpcArgs: RpcMakeOfferArgs = {
      p_listing_id: trimmedListingId,
      p_buyer_id: user.id,
      p_offer_price: offerPrice,
      p_content: useAuthentication
        ? formatAuthOfferMessageContent(offerPrice, authServiceFeeHkd)
        : formatStandardOfferMessageContent(offerPrice),
      p_use_authentication: useAuthentication,
    };

    const { data, error } = await (
      supabase as unknown as {
        rpc: (
          fn: "rpc_make_offer",
          args: RpcMakeOfferArgs,
        ) => Promise<{
          data: unknown;
          error: { message: string } | null;
        }>;
      }
    ).rpc("rpc_make_offer", rpcArgs);

    if (error) {
      console.error("[makeOffer] rpc", error.message);
      return { success: false, error: error.message };
    }

    const parsed = parseRpcMakeOfferPayload(data);
    if (!parsed) {
      console.error("[makeOffer] invalid rpc payload", data);
      return { success: false, error: "出價回傳資料格式異常" };
    }

    await enqueueOfferReceivedEmail({
      offerId: parsed.offer.id,
      listingId: trimmedListingId,
      buyerId: user.id,
      sellerId: listing.seller_id,
      offerPrice: offerPrice,
    });

    await sendOfferReceivedPush({
      listingId: trimmedListingId,
      buyerId: user.id,
      sellerId: listing.seller_id,
      offerPrice,
    });

    return {
      success: true,
      data: parsed,
    };
  } catch (error) {
    console.error("[makeOffer]", error);
    return { success: false, error: "出價時發生錯誤" };
  }
}

export async function acceptOffer(offerId: string): Promise<AcceptOfferResult> {
  const trimmedOfferId = offerId.trim();
  if (!trimmedOfferId) {
    return { success: false, error: "找不到此出價紀錄" };
  }

  try {
    const guard = await requireActiveAuthUser();
    if (!guard.ok) {
      return { success: false, error: guard.error };
    }
    const { user, supabase } = guard;

    const rpcArgs: RpcAcceptOfferArgs = {
      p_offer_id: trimmedOfferId,
      p_seller_id: user.id,
    };

    const { data, error } = await (
      supabase as unknown as {
        rpc: (
          fn: "rpc_accept_offer",
          args: RpcAcceptOfferArgs,
        ) => Promise<{
          data: unknown;
          error: { message: string } | null;
        }>;
      }
    ).rpc("rpc_accept_offer", rpcArgs);

    if (error) {
      console.error("[acceptOffer] rpc", error.message);
      return { success: false, error: error.message };
    }

    const parsed = parseRpcAcceptOfferPayload(data);
    if (!parsed) {
      console.error("[acceptOffer] invalid rpc payload", data);
      return { success: false, error: "接受出價回傳資料格式異常" };
    }

    revalidatePath("/marketplace");
    revalidateHomeListingsCache();
    revalidatePath("/profile/user/inventory");
    revalidatePath("/profile/user/collection");
    revalidatePath("/profile/merchant/inventory");
    revalidatePath("/profile/merchant/trading");
    revalidatePath("/profile/user/trading");

    await enqueueOfferAcceptedEmail({
      offerId: trimmedOfferId,
      orderId: parsed.order.id,
      orderKind: parsed.orderKind,
    });

    await sendOfferAcceptedPush({
      offerId: trimmedOfferId,
      orderId: parsed.order.id,
    });

    if (parsed.orderKind === "member") {
      const memberOrder = parsed.order as MemberOrderRow;
      if (!memberOrder.use_authentication) {
        await enqueueP2pMeetupArrangedEmails({
          orderId: memberOrder.id,
          buyerId: memberOrder.buyer_id,
          sellerId: memberOrder.seller_id,
          listingId: memberOrder.listing_id,
          orderNumber: memberOrder.order_number,
        });
      }
    }

    const listingId = parsed.order.listing_id;
    if (listingId) {
      await enqueueOfferExpiredEmailsForListing({
        listingId,
        reason: "order_created_elsewhere",
        excludeOfferIds: [trimmedOfferId],
      });
    }

    return {
      success: true,
      data: parsed,
    };
  } catch (error) {
    console.error("[acceptOffer]", error);
    return { success: false, error: "接受出價時發生錯誤" };
  }
}

export async function modifyOffer(
  offerId: string,
  newPrice: number,
): Promise<ModifyOfferResult> {
  const trimmedOfferId = offerId.trim();
  if (!trimmedOfferId) {
    return { success: false, error: "找不到此出價紀錄" };
  }

  const priceError = validateOfferPrice(newPrice);
  if (priceError) {
    return { success: false, error: priceError };
  }

  try {
    const guard = await requireActiveAuthUser();
    if (!guard.ok) {
      return { success: false, error: guard.error };
    }
    const { user, supabase } = guard;

    const rpcArgs: RpcModifyOfferArgs = {
      p_offer_id: trimmedOfferId,
      p_buyer_id: user.id,
      p_new_price: newPrice,
      p_content: formatModifyOfferMessageContent(newPrice),
    };

    const { data, error } = await (
      supabase as unknown as {
        rpc: (
          fn: "rpc_modify_offer",
          args: RpcModifyOfferArgs,
        ) => Promise<{
          data: unknown;
          error: { message: string } | null;
        }>;
      }
    ).rpc("rpc_modify_offer", rpcArgs);

    if (error) {
      console.error("[modifyOffer] rpc", error.message);
      return { success: false, error: error.message };
    }

    const parsed = parseRpcModifyOfferPayload(data);
    if (!parsed) {
      console.error("[modifyOffer] invalid rpc payload", data);
      return { success: false, error: "修改出價回傳資料格式異常" };
    }

    if (parsed.offer.listing_id) {
      await enqueueOfferModifiedEmail({
        offerId: parsed.offer.id,
        listingId: parsed.offer.listing_id,
        buyerId: user.id,
        offerPrice: newPrice,
      });
    }

    return {
      success: true,
      data: parsed,
    };
  } catch (error) {
    console.error("[modifyOffer]", error);
    const message =
      error instanceof Error ? error.message : "修改出價時發生錯誤";
    return { success: false, error: message };
  }
}

export async function rejectOffer(offerId: string): Promise<RejectOfferResult> {
  const trimmedOfferId = offerId.trim();
  if (!trimmedOfferId) {
    return { success: false, error: "找不到此出價紀錄" };
  }

  try {
    const guard = await requireActiveAuthUser();
    if (!guard.ok) {
      return { success: false, error: guard.error };
    }
    const { user, supabase } = guard;

    const rpcArgs: RpcRejectOfferArgs = {
      p_offer_id: trimmedOfferId,
      p_seller_id: user.id,
    };

    const { data, error } = await (
      supabase as unknown as {
        rpc: (
          fn: "rpc_reject_offer",
          args: RpcRejectOfferArgs,
        ) => Promise<{
          data: unknown;
          error: { message: string } | null;
        }>;
      }
    ).rpc("rpc_reject_offer", rpcArgs);

    if (error) {
      console.error("[rejectOffer] rpc", error.message);
      return { success: false, error: error.message };
    }

    const parsed = parseRpcRejectOfferPayload(data);
    if (!parsed) {
      console.error("[rejectOffer] invalid rpc payload", data);
      return { success: false, error: "拒絕出價回傳資料格式異常" };
    }

    const listingId = parsed.offer.listing_id;
    if (listingId && parsed.offer.buyer_id) {
      await enqueueOfferRejectedEmail({
        offerId: parsed.offer.id,
        buyerId: parsed.offer.buyer_id,
        listingId,
        sellerId: user.id,
        offerPrice: Number(parsed.offer.offer_price),
      });

      await sendOfferRejectedPush({
        buyerId: parsed.offer.buyer_id,
        listingId,
        sellerId: user.id,
        offerPrice: Number(parsed.offer.offer_price),
      });
    }

    return {
      success: true,
      data: parsed,
    };
  } catch (error) {
    console.error("[rejectOffer]", error);
    const message =
      error instanceof Error ? error.message : "拒絕出價時發生錯誤";
    return { success: false, error: message };
  }
}
