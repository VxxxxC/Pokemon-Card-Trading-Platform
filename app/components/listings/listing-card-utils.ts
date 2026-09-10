import type { Tables } from "@/types/supabase";

export type ListingCardRarity = Tables<"product_catalog">["rarity"] | string | null;

export function hasDisplayableRarity(
  rarity: ListingCardRarity,
): rarity is NonNullable<ListingCardRarity> {
  if (!rarity) return false;
  const trimmed = rarity.trim();
  return trimmed !== "" && trimmed !== "-";
}

export function formatListingPriceHkd(price: number): string {
  return `HK$ ${price.toLocaleString("en-HK")}`;
}

export function resolveListingMetaLine(input: {
  set?: string | null;
  cardNo?: string | null;
  productId?: string | null;
}): string {
  const cardCode =
    input.cardNo?.trim() || input.productId?.trim() || "";
  const setCode = input.set?.trim();
  if (!cardCode) return "";
  return setCode ? `${setCode.toUpperCase()} · ${cardCode}` : cardCode;
}

export function resolveListingDisplayName(listing: {
  name?: string | null;
  nameZh?: string | null;
  nameJa?: string | null;
}): string {
  const primary = listing.name?.trim();
  if (primary) return primary;

  const zh = listing.nameZh?.trim();
  if (zh) return zh;

  const ja = listing.nameJa?.trim();
  if (ja) return ja;

  return "未命名卡牌";
}

export function resolveProductDetailHref(listing: {
  detailHref?: string | null;
  sellerId?: string | null;
  id: string;
  productId?: string | null;
}): string {
  const explicitHref = listing.detailHref?.trim();
  if (explicitHref) {
    return explicitHref;
  }

  const sellerId = listing.sellerId?.trim();
  const listingId = listing.id?.trim();
  if (sellerId && listingId) {
    return `/marketplace/${sellerId}/product/${listingId}`;
  }

  return `/marketplace/product/${listing.productId ?? listing.id}`;
}
