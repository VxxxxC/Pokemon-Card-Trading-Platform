import type { MarketplaceProductDetail } from "@/app/lib/marketplace/types";
import type { MarketplaceListing } from "@/app/components/marketplace/MarketplaceCard";
import type { ReviewPersona } from "@/app/lib/reviews/types";
import {
  loadMarketplaceSellerProfile,
  type MarketplaceSellerProfile,
} from "@/lib/marketplace/load-seller-profile";
import { toMarketplaceCardListing } from "@/lib/marketplace/map-seller-listing";
import { isUuid } from "@/lib/marketplace/seller-profile";
import { parseListingImageUrls } from "@/lib/listings/images";
import { createPublicClient } from "@/lib/supabase/public";
import type { Tables } from "@/types/supabase";

type ListingRow = Pick<
  Tables<"listings">,
  | "id"
  | "product_id"
  | "price"
  | "grading_company"
  | "grading_score"
  | "seller_id"
  | "seller_description"
  | "images"
  | "use_authentication"
  | "seller_persona"
>;

export type MarketplaceSellerListingDetail = {
  seller: MarketplaceSellerProfile;
  catalog: MarketplaceProductDetail;
  listingRow: ListingRow;
  storefrontListing: MarketplaceListing;
  photos: string[];
  batchLabel: string;
};

async function resolveProductCatalogId(
  key: string,
): Promise<string | null> {
  const supabase = createPublicClient();
  const trimmed = key.trim();
  if (!trimmed) return null;

  const byDisplay = await supabase
    .from("product_catalog")
    .select("id")
    .eq("display_id", trimmed)
    .maybeSingle<{ id: string }>();

  if (byDisplay.data?.id) {
    return byDisplay.data.id;
  }

  const byId = await supabase
    .from("product_catalog")
    .select("id")
    .eq("id", trimmed)
    .maybeSingle<{ id: string }>();

  return byId.data?.id ?? null;
}

async function findSellerListing(
  sellerId: string,
  listingKey: string,
): Promise<ListingRow | null> {
  const supabase = createPublicClient();
  const key = listingKey.trim();
  if (!key) return null;

  const columns =
    "id, product_id, price, grading_company, grading_score, seller_id, seller_description, images, use_authentication, seller_persona";

  if (isUuid(key)) {
    const byListingId = await supabase
      .from("listings")
      .select(columns)
      .eq("id", key)
      .eq("seller_id", sellerId)
      .eq("status", "active")
      .maybeSingle<ListingRow>();

    if (byListingId.data) {
      return byListingId.data;
    }
  }

  const productId = (await resolveProductCatalogId(key)) ?? (isUuid(key) ? key : null);
  if (!productId) {
    return null;
  }

  const byProduct = await supabase
    .from("listings")
    .select(columns)
    .eq("seller_id", sellerId)
    .eq("product_id", productId)
    .eq("status", "active")
    .order("price", { ascending: true })
    .limit(1)
    .maybeSingle<ListingRow>();

  return byProduct.data ?? null;
}

function buildPhotoGallery(
  listingImages: unknown,
  catalogImageUrl: string,
): string[] {
  const parsed = parseListingImageUrls(listingImages).filter(Boolean);
  const catalogImage = catalogImageUrl?.trim();

  const photos =
    parsed.length > 0
      ? parsed
      : catalogImage
        ? [catalogImage]
        : ["/placeholder-card.png"];

  return photos.slice(0, 6);
}

export async function loadMarketplaceSellerListingDetail(
  sellerKey: string,
  listingKey: string,
  catalog: MarketplaceProductDetail,
): Promise<Omit<MarketplaceSellerListingDetail, "catalog"> & {
  catalog?: MarketplaceProductDetail;
} | null> {
  const sellerStub = await loadMarketplaceSellerProfile(sellerKey);
  if (!sellerStub) {
    return null;
  }

  const listingRow = await findSellerListing(sellerStub.id, listingKey);
  if (!listingRow) {
    return null;
  }

  const viewPersona: ReviewPersona =
    listingRow.seller_persona === "merchant" ? "merchant" : "member";
  const seller = await loadMarketplaceSellerProfile(sellerKey, viewPersona);
  if (!seller) {
    return null;
  }

  const sellerListingRow = {
    listingId: listingRow.id,
    productId: listingRow.product_id,
    productName: catalog.productName,
    nameJa: catalog.nameJa,
    nameEn: catalog.nameEn,
    nameZh: catalog.nameZh,
    setCode: catalog.setCode,
    cardNumber: catalog.cardNumber,
    displayId: catalog.displayId,
    rarity: catalog.rarity,
    imageUrl: catalog.imageUrl,
    catalogImageUrl: catalog.imageUrl,
    gradingCompany: listingRow.grading_company,
    gradingScore: listingRow.grading_score,
    price: Number(listingRow.price),
    createdAt: new Date().toISOString(),
    sellerId: listingRow.seller_id,
    sellerName: seller.username,
    sellerPersona: listingRow.seller_persona,
    useAuthentication: listingRow.use_authentication,
    marketAvgPrice: null,
    marketReferenceSource: null,
    priceVsMarketPct: null,
  };

  return {
    seller,
    listingRow,
    storefrontListing: toMarketplaceCardListing(sellerListingRow, {
      imageUrl:
        parseListingImageUrls(listingRow.images)[0]?.trim() || catalog.imageUrl,
    }),
    photos: buildPhotoGallery(listingRow.images, catalog.imageUrl),
    batchLabel: listingRow.id,
  };
}

export async function resolveSellerListingCatalogKey(
  sellerKey: string,
  listingKey: string,
): Promise<string | null> {
  const seller = await loadMarketplaceSellerProfile(sellerKey);
  if (!seller) {
    return null;
  }

  const listingRow = await findSellerListing(seller.id, listingKey);
  if (!listingRow) {
    return null;
  }

  return listingRow.product_id;
}
