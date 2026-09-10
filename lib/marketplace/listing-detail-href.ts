/** Seller storefront listing detail — `[productId]` segment is the listing id. */
export function buildSellerListingDetailHref(
  sellerId: string,
  listingId: string,
): string {
  const seller = sellerId.trim();
  const listing = listingId.trim();
  if (!seller || !listing) {
    return "/marketplace";
  }
  return `/marketplace/${encodeURIComponent(seller)}/product/${encodeURIComponent(listing)}`;
}
