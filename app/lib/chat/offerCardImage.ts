import { parseListingImageUrls } from "@/lib/listings/images";

/** Prefer the listing's first uploaded photo; fall back to catalog art. */
export function resolveOfferCardDisplayImage(
  listingImages: unknown,
  catalogImageUrl?: string | null,
): string {
  const listingUrls = parseListingImageUrls(listingImages);
  const catalogUrl = catalogImageUrl?.trim() ?? "";
  return listingUrls[0] ?? catalogUrl;
}

export function isValidOfferCardImageUrl(
  url?: string | null,
): url is string {
  return typeof url === "string" && url.trim().length > 0;
}

export function resolveOfferCardHeroImageUrl(
  context: {
    listingImageUrls?: string[];
    imageUrl?: string | null;
  },
): string | undefined {
  const listingFirst = context.listingImageUrls?.[0]?.trim();
  if (listingFirst) {
    return listingFirst;
  }

  const persisted = context.imageUrl?.trim() ?? "";
  if (persisted && !isCatalogImageUrl(persisted)) {
    return persisted;
  }

  return undefined;
}

export function needsOfferCardListingImageFetch(
  context: {
    listingImageUrls?: string[];
    imageUrl?: string | null;
    offer?: { id?: string };
  } | null
  | undefined,
): boolean {
  if (!context?.offer?.id) {
    return false;
  }

  if (resolveOfferCardHeroImageUrl(context)) {
    return false;
  }

  return true;
}

export function isCatalogImageUrl(url: string): boolean {
  try {
    return new URL(url).hostname === "www.pokemon-card.com";
  } catch {
    return false;
  }
}
