import { getSiteUrl } from "@/lib/auth/site-url";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Tables } from "@/types/supabase";
import {
  buildBuyerOrderDetailUrl,
  buildMemberTradingUrl,
  buildSellerOrderDetailUrl,
  buildSellerTradingUrl,
} from "@/lib/notifications/email-urls";
import { enqueueTransactionalEmail } from "@/lib/notifications/enqueue-email";
import { resolveAuthUserEmails } from "@/lib/notifications/resolve-auth-user-email";
import { resolveEmailLogoUrl } from "@/lib/email/layout";

type ListingEmailContext = {
  listingId: string;
  cardName: string;
  sellerId: string;
  sellerPersona: "merchant" | "member";
};

type ProfileNameRow = Pick<Tables<"profiles">, "display_name" | "username">;
type MerchantShopNameRow = Pick<Tables<"merchant_shops">, "shop_name" | "shop_handle">;

function formatHkd(amount: number): string {
  return `HK$${amount.toLocaleString("en-HK", { maximumFractionDigits: 0 })}`;
}

async function fetchListingEmailContext(
  listingId: string,
): Promise<ListingEmailContext | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("listings")
    .select(
      `
        id,
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
      id: string;
      seller_id: string;
      seller_persona: Tables<"listings">["seller_persona"] | null;
      product_catalog: {
        name_zh: string | null;
        name_ja: string;
      } | null;
    }>();

  if (error || !data) {
    console.warn("[offer-emails] listing lookup", listingId, error?.message);
    return null;
  }

  const catalog = data.product_catalog;
  const cardName =
    catalog?.name_zh?.trim() || catalog?.name_ja?.trim() || "商品";

  return {
    listingId: data.id,
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

  return data?.display_name?.trim() || data?.username?.trim() || "會員";
}

async function resolveSellerDisplayName(
  sellerId: string,
  sellerPersona: "merchant" | "member",
): Promise<string> {
  const admin = createAdminClient();

  if (sellerPersona === "merchant") {
    const { data } = await admin
      .from("merchant_shops")
      .select("shop_name, shop_handle")
      .eq("merchant_id", sellerId)
      .maybeSingle<MerchantShopNameRow>();

    return (
      data?.shop_name?.trim() ||
      data?.shop_handle?.trim() ||
      "認證商戶"
    );
  }

  return resolveMemberDisplayName(sellerId);
}

async function enqueueOfferEmailSafely(
  input: Parameters<typeof enqueueTransactionalEmail>[0],
): Promise<void> {
  try {
    await enqueueTransactionalEmail(input);
  } catch (error) {
    console.warn("[offer-emails] enqueue failed", input.eventId, error);
  }
}

export async function enqueueOfferReceivedEmail(args: {
  offerId: string;
  listingId: string;
  buyerId: string;
  sellerId: string;
  offerPrice: number;
}): Promise<void> {
  const listing = await fetchListingEmailContext(args.listingId);
  if (!listing) return;

  const emails = await resolveAuthUserEmails([args.sellerId, args.buyerId]);
  const sellerEmail = emails.get(args.sellerId);
  if (!sellerEmail) return;

  const buyerName = await resolveMemberDisplayName(args.buyerId);
  const siteUrl = await getSiteUrl();
  const actionUrl = buildSellerTradingUrl(siteUrl, listing.sellerPersona);
  const logoUrl = resolveEmailLogoUrl(siteUrl);

  await enqueueOfferEmailSafely({
    eventId: "E-OFF-01",
    templateKey: "offer.received",
    toEmail: sellerEmail,
    idempotencyKey: `E-OFF-01:${args.offerId}:received`,
    payload: {
      cardName: listing.cardName,
      buyerName,
      offerPrice: args.offerPrice,
      offerPriceLabel: formatHkd(args.offerPrice),
      actionUrl,
      logoUrl,
    },
  });
}

export async function enqueueOfferModifiedEmail(args: {
  offerId: string;
  listingId: string;
  buyerId: string;
  offerPrice: number;
}): Promise<void> {
  const listing = await fetchListingEmailContext(args.listingId);
  if (!listing) return;

  const admin = createAdminClient();
  const { data: listingRow } = await admin
    .from("listings")
    .select("seller_id")
    .eq("id", args.listingId)
    .maybeSingle<{ seller_id: string }>();

  const sellerId = listingRow?.seller_id;
  if (!sellerId) return;

  const sellerEmail = await resolveAuthUserEmails([sellerId]).then(
    (map) => map.get(sellerId),
  );
  if (!sellerEmail) return;

  const buyerName = await resolveMemberDisplayName(args.buyerId);
  const siteUrl = await getSiteUrl();
  const actionUrl = buildSellerTradingUrl(siteUrl, listing.sellerPersona);
  const logoUrl = resolveEmailLogoUrl(siteUrl);

  await enqueueOfferEmailSafely({
    eventId: "E-OFF-02",
    templateKey: "offer.countered",
    toEmail: sellerEmail,
    idempotencyKey: `E-OFF-02:${args.offerId}:modified`,
    payload: {
      cardName: listing.cardName,
      buyerName,
      offerPrice: args.offerPrice,
      offerPriceLabel: formatHkd(args.offerPrice),
      actionUrl,
      logoUrl,
    },
  });
}

export async function enqueueOfferAcceptedEmail(args: {
  offerId: string;
  orderId: string;
  orderKind: "merchant" | "member";
}): Promise<void> {
  const admin = createAdminClient();
  const { data: offer, error } = await admin
    .from("offers")
    .select("buyer_id, listing_id, offer_price")
    .eq("id", args.offerId)
    .maybeSingle<Pick<Tables<"offers">, "buyer_id" | "listing_id" | "offer_price">>();

  if (error || !offer?.listing_id || !offer.buyer_id) {
    console.warn("[offer-emails] offer lookup", args.offerId, error?.message);
    return;
  }

  const listing = await fetchListingEmailContext(offer.listing_id);
  if (!listing) return;

  const buyerEmail = await resolveAuthUserEmails([offer.buyer_id]).then(
    (map) => map.get(offer.buyer_id),
  );
  if (!buyerEmail) return;

  const sellerName = await resolveSellerDisplayName(
    listing.sellerId,
    listing.sellerPersona,
  );
  const offerPrice = Number(offer.offer_price);
  const siteUrl = await getSiteUrl();
  const actionUrl = buildBuyerOrderDetailUrl(siteUrl, args.orderId);
  const logoUrl = resolveEmailLogoUrl(siteUrl);

  await enqueueOfferEmailSafely({
    eventId: "E-OFF-03",
    templateKey: "offer.accepted",
    toEmail: buyerEmail,
    idempotencyKey: `E-OFF-03:${args.offerId}:accepted`,
    payload: {
      cardName: listing.cardName,
      sellerName,
      offerPrice,
      offerPriceLabel: formatHkd(offerPrice),
      orderKind: args.orderKind,
      actionUrl,
      logoUrl,
    },
  });
}

export async function enqueueOfferRejectedEmail(args: {
  offerId: string;
  buyerId: string;
  listingId: string;
  sellerId: string;
  offerPrice: number;
}): Promise<void> {
  const listing = await fetchListingEmailContext(args.listingId);
  if (!listing) return;

  const buyerEmail = await resolveAuthUserEmails([args.buyerId]).then(
    (map) => map.get(args.buyerId),
  );
  if (!buyerEmail) return;

  const sellerName = await resolveSellerDisplayName(
    args.sellerId,
    listing.sellerPersona,
  );
  const siteUrl = await getSiteUrl();
  const actionUrl = buildSellerTradingUrl(siteUrl, "member");
  const logoUrl = resolveEmailLogoUrl(siteUrl);

  await enqueueOfferEmailSafely({
    eventId: "E-OFF-04",
    templateKey: "offer.rejected",
    toEmail: buyerEmail,
    idempotencyKey: `E-OFF-04:${args.offerId}:rejected`,
    payload: {
      cardName: listing.cardName,
      sellerName,
      offerPrice: args.offerPrice,
      offerPriceLabel: formatHkd(args.offerPrice),
      actionUrl,
      logoUrl,
    },
  });
}

export async function enqueueOfferExpiredEmailsForListing(args: {
  listingId: string;
  reason?: "listing_inactive" | "order_created_elsewhere";
  excludeOfferIds?: string[];
}): Promise<void> {
  const admin = createAdminClient();
  const { data: offers, error } = await admin
    .from("offers")
    .select("id, buyer_id, offer_price")
    .eq("listing_id", args.listingId)
    .eq("status", "pending");

  if (error || !offers?.length) {
    if (error) {
      console.warn(
        "[offer-emails] pending offers lookup",
        args.listingId,
        error.message,
      );
    }
    return;
  }

  const exclude = new Set(args.excludeOfferIds ?? []);
  const listing = await fetchListingEmailContext(args.listingId);
  if (!listing) return;

  const siteUrl = await getSiteUrl();
  const actionUrl = buildMemberTradingUrl(siteUrl);
  const logoUrl = resolveEmailLogoUrl(siteUrl);
  const reason = args.reason ?? "listing_inactive";

  for (const offer of offers) {
    if (exclude.has(offer.id)) continue;

    const buyerEmail = await resolveAuthUserEmails([offer.buyer_id]).then(
      (map) => map.get(offer.buyer_id),
    );
    if (!buyerEmail) continue;

    const offerPrice = Number(offer.offer_price);

    await enqueueOfferEmailSafely({
      eventId: "E-OFF-05",
      templateKey: "offer.expired",
      toEmail: buyerEmail,
      idempotencyKey: `E-OFF-05:${offer.id}:expired`,
      payload: {
        cardName: listing.cardName,
        offerPrice,
        offerPriceLabel: formatHkd(offerPrice),
        reason,
        actionUrl,
        logoUrl,
      },
    });
  }
}

export async function enqueueBuyNowSellerEmail(args: {
  offerId: string;
  listingId: string;
  sellerId: string;
  buyerId: string;
  orderId: string;
  offerPrice: number;
}): Promise<void> {
  const listing = await fetchListingEmailContext(args.listingId);
  if (!listing) return;

  const emails = await resolveAuthUserEmails([args.sellerId, args.buyerId]);
  const sellerEmail = emails.get(args.sellerId);
  if (!sellerEmail) return;

  const buyerName = await resolveMemberDisplayName(args.buyerId);
  const siteUrl = await getSiteUrl();
  const actionUrl = buildSellerOrderDetailUrl(
    siteUrl,
    args.orderId,
    listing.sellerPersona,
  );
  const logoUrl = resolveEmailLogoUrl(siteUrl);

  await enqueueOfferEmailSafely({
    eventId: "E-OFF-06",
    templateKey: "offer.buy_now",
    toEmail: sellerEmail,
    idempotencyKey: `E-OFF-06:${args.offerId}:buy_now`,
    payload: {
      cardName: listing.cardName,
      buyerName,
      offerPrice: args.offerPrice,
      offerPriceLabel: formatHkd(args.offerPrice),
      actionUrl,
      logoUrl,
    },
  });
}
