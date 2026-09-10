import { createAdminClient } from "@/lib/supabase/admin";
import { sendPushToUser } from "@/lib/notifications/push-delivery";
import type { Tables } from "@/types/supabase";

type ListingPushContext = {
  cardName: string;
  sellerId: string;
  sellerPersona: "merchant" | "member";
};

type ProfileNameRow = Pick<Tables<"profiles">, "display_name" | "username">;
type MerchantShopNameRow = Pick<Tables<"merchant_shops">, "shop_name" | "shop_handle">;

export function formatOfferPushPrice(amount: number): string {
  return `HK$${amount.toLocaleString("en-HK", { maximumFractionDigits: 0 })}`;
}

async function fetchListingPushContext(
  listingId: string,
): Promise<ListingPushContext | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("listings")
    .select(
      `
        seller_id,
        seller_persona,
        product_catalog (
          name_zh,
          name_ja
        )
      `,
    )
    .eq("id", listingId)
    .maybeSingle<{
      seller_id: string;
      seller_persona: Tables<"listings">["seller_persona"] | null;
      product_catalog: {
        name_zh: string | null;
        name_ja: string;
      } | null;
    }>();

  if (error || !data) {
    console.warn("[offer-push] listing lookup", listingId, error?.message);
    return null;
  }

  const catalog = data.product_catalog;
  const cardName =
    catalog?.name_zh?.trim() || catalog?.name_ja?.trim() || "商品";

  return {
    cardName,
    sellerId: data.seller_id,
    sellerPersona: data.seller_persona === "merchant" ? "merchant" : "member",
  };
}

async function resolveMemberDisplayName(userId: string): Promise<string> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("profiles")
    .select("display_name, username")
    .eq("id", userId)
    .maybeSingle<ProfileNameRow>();

  return data?.display_name?.trim() || data?.username?.trim() || "買家";
}

async function resolveSellerDisplayName(
  sellerId: string,
  sellerPersona: "merchant" | "member",
): Promise<string> {
  if (sellerPersona === "merchant") {
    const admin = createAdminClient();
    const { data } = await admin
      .from("merchant_shops")
      .select("shop_name, shop_handle")
      .eq("merchant_id", sellerId)
      .maybeSingle<MerchantShopNameRow>();

    return data?.shop_name?.trim() || data?.shop_handle?.trim() || "賣家";
  }

  return resolveMemberDisplayName(sellerId);
}

function sellerTradingPath(sellerPersona: "merchant" | "member"): string {
  return sellerPersona === "merchant"
    ? "/profile/merchant/trading"
    : "/profile/user/trading";
}

function sellerOrderDetailPath(
  orderId: string,
  sellerPersona: "merchant" | "member",
): string {
  return sellerPersona === "merchant"
    ? `/profile/merchant/orderDetail/${orderId}`
    : `/profile/user/orderDetail/${orderId}`;
}

export function buildOfferReceivedPushCopy(input: {
  cardName: string;
  buyerName: string;
  offerPrice: number;
}): { heading: string; body: string } {
  return {
    heading: "收到新出價",
    body: `${input.buyerName} 對 ${input.cardName} 出價 ${formatOfferPushPrice(input.offerPrice)}`,
  };
}

export function buildOfferAcceptedPushCopy(input: {
  cardName: string;
  sellerName: string;
  offerPrice: number;
}): { heading: string; body: string } {
  return {
    heading: "出價已被接受",
    body: `${input.sellerName} 已接受你對 ${input.cardName} 的出價 ${formatOfferPushPrice(input.offerPrice)}`,
  };
}

export function buildOfferRejectedPushCopy(input: {
  cardName: string;
  sellerName: string;
  offerPrice: number;
}): { heading: string; body: string } {
  return {
    heading: "出價已被拒絕",
    body: `${input.sellerName} 已拒絕你對 ${input.cardName} 的出價 ${formatOfferPushPrice(input.offerPrice)}`,
  };
}

export function buildBuyNowSellerPushCopy(input: {
  cardName: string;
  buyerName: string;
  offerPrice: number;
}): { heading: string; body: string } {
  return {
    heading: "買家立即購買",
    body: `${input.buyerName} 已立即購買 ${input.cardName}（${formatOfferPushPrice(input.offerPrice)}）`,
  };
}

export async function sendOfferReceivedPush(args: {
  listingId: string;
  buyerId: string;
  sellerId: string;
  offerPrice: number;
}): Promise<void> {
  const listing = await fetchListingPushContext(args.listingId);
  if (!listing) return;

  const buyerName = await resolveMemberDisplayName(args.buyerId);
  const copy = buildOfferReceivedPushCopy({
    cardName: listing.cardName,
    buyerName,
    offerPrice: args.offerPrice,
  });

  await sendPushToUser({
    eventId: "P-OFF-01",
    userId: args.sellerId,
    heading: copy.heading,
    body: copy.body,
    path: sellerTradingPath(listing.sellerPersona),
  });
}

export async function sendOfferAcceptedPush(args: {
  offerId: string;
  orderId: string;
}): Promise<void> {
  const admin = createAdminClient();
  const { data: offer, error } = await admin
    .from("offers")
    .select("buyer_id, listing_id, offer_price")
    .eq("id", args.offerId)
    .maybeSingle<Pick<Tables<"offers">, "buyer_id" | "listing_id" | "offer_price">>();

  if (error || !offer?.listing_id || !offer.buyer_id) {
    console.warn("[offer-push] offer lookup", args.offerId, error?.message);
    return;
  }

  const listing = await fetchListingPushContext(offer.listing_id);
  if (!listing) return;

  const sellerName = await resolveSellerDisplayName(
    listing.sellerId,
    listing.sellerPersona,
  );
  const copy = buildOfferAcceptedPushCopy({
    cardName: listing.cardName,
    sellerName,
    offerPrice: Number(offer.offer_price),
  });

  await sendPushToUser({
    eventId: "P-OFF-02",
    userId: offer.buyer_id,
    heading: copy.heading,
    body: copy.body,
    path: `/profile/user/orderDetail/${args.orderId}`,
  });
}

export async function sendOfferRejectedPush(args: {
  buyerId: string;
  listingId: string;
  sellerId: string;
  offerPrice: number;
}): Promise<void> {
  const listing = await fetchListingPushContext(args.listingId);
  if (!listing) return;

  const sellerName = await resolveSellerDisplayName(
    args.sellerId,
    listing.sellerPersona,
  );
  const copy = buildOfferRejectedPushCopy({
    cardName: listing.cardName,
    sellerName,
    offerPrice: args.offerPrice,
  });

  await sendPushToUser({
    eventId: "P-OFF-03",
    userId: args.buyerId,
    heading: copy.heading,
    body: copy.body,
    path: "/profile/user/trading",
  });
}

export async function sendBuyNowSellerPush(args: {
  listingId: string;
  sellerId: string;
  buyerId: string;
  orderId: string;
  offerPrice: number;
}): Promise<void> {
  const listing = await fetchListingPushContext(args.listingId);
  if (!listing) return;

  const buyerName = await resolveMemberDisplayName(args.buyerId);
  const copy = buildBuyNowSellerPushCopy({
    cardName: listing.cardName,
    buyerName,
    offerPrice: args.offerPrice,
  });

  await sendPushToUser({
    eventId: "P-OFF-04",
    userId: args.sellerId,
    heading: copy.heading,
    body: copy.body,
    path: sellerOrderDetailPath(args.orderId, listing.sellerPersona),
  });
}
