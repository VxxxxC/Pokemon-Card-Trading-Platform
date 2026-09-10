import { formatListingGrade } from "@/lib/marketplace/listing-display";
import { resolveListingCoverImageUrl } from "@/lib/listings/images";
import type { MarketplaceMerchantShippingFields } from "@/app/lib/marketplace/types";
import type { MarketplaceTrendSource } from "@/app/lib/marketplace/types";
import type { Database } from "@/types/supabase";

function toFiniteNumber(value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(Number(value))) {
    return null;
  }
  return Number(value);
}

function resolveMarketReferenceSource(
  value: string | null | undefined,
): MarketplaceTrendSource | null {
  if (value === "snkrdunk" || value === "platform") {
    return value;
  }
  return null;
}

export type SellerListingRpcRow = {
  listing_id: string;
  product_id: string;
  product_name: string | null;
  name_ja: string;
  name_en: string | null;
  name_zh: string | null;
  set_code: string | null;
  card_number: string | null;
  display_id: string | null;
  rarity: string | null;
  image_url: string | null;
  grading_company: string;
  grading_score: string | null;
  price: number;
  created_at: string;
  seller_id: string;
  seller_name: string | null;
  seller_persona: Database["public"]["Enums"]["seller_persona_type"];
  use_authentication: boolean;
  market_avg_price: number | null;
  market_data_source: string | null;
  price_vs_market_pct: number | null;
  seller_min_price: number | null;
  seller_max_price: number | null;
  total_count: number;
  page: number;
  page_size: number;
  total_pages: number;
  range_start: number;
  range_end: number;
};

export type MarketplaceSellerListingRow = {
  listingId: string;
  productId: string;
  productName: string;
  nameJa: string;
  nameEn: string | null;
  nameZh: string | null;
  setCode: string;
  cardNumber: string | null;
  displayId: string | null;
  rarity: string | null;
  imageUrl: string;
  catalogImageUrl: string | null;
  gradingCompany: string;
  gradingScore: string | null;
  price: number;
  createdAt: string;
  sellerId: string;
  sellerName: string;
  sellerPersona: Database["public"]["Enums"]["seller_persona_type"];
  useAuthentication: boolean;
  marketAvgPrice: number | null;
  marketReferenceSource: MarketplaceTrendSource | null;
  priceVsMarketPct: number | null;
} & MarketplaceMerchantShippingFields;

export function mapSellerListingRpcRow(
  row: SellerListingRpcRow,
): MarketplaceSellerListingRow {
  return {
    listingId: row.listing_id,
    productId: row.product_id,
    productName: row.product_name ?? row.name_zh ?? row.name_ja ?? "未知卡牌",
    nameJa: row.name_ja,
    nameEn: row.name_en,
    nameZh: row.name_zh,
    setCode: row.set_code ?? "",
    cardNumber: row.card_number,
    displayId: row.display_id,
    rarity: row.rarity,
    imageUrl: row.image_url?.trim() || "/placeholder-card.png",
    catalogImageUrl: row.image_url?.trim() || null,
    gradingCompany: row.grading_company,
    gradingScore: row.grading_score,
    price: Number(row.price),
    createdAt: row.created_at,
    sellerId: row.seller_id,
    sellerName: row.seller_name ?? "賣家",
    sellerPersona: row.seller_persona,
    useAuthentication: row.use_authentication,
    marketAvgPrice: toFiniteNumber(row.market_avg_price),
    marketReferenceSource: resolveMarketReferenceSource(row.market_data_source),
    priceVsMarketPct: toFiniteNumber(row.price_vs_market_pct),
  };
}

export function resolveSellerListingImage(
  row: MarketplaceSellerListingRow,
  listingImages?: unknown,
): string {
  const catalogUrl =
    row.imageUrl.trim() && row.imageUrl !== "/placeholder-card.png"
      ? row.imageUrl
      : null;
  return resolveListingCoverImageUrl(listingImages, catalogUrl) ?? "";
}

export function toMarketplaceCardListing(
  row: MarketplaceSellerListingRow,
  options?: { imageUrl?: string },
) {
  const grade = formatListingGrade(row.gradingCompany, row.gradingScore);

  return {
    id: row.listingId,
    productId: row.productId,
    cardNo: row.cardNumber ?? row.displayId ?? row.productId,
    name: row.productName,
    nameZh: row.nameZh,
    nameJa: row.nameJa,
    set: row.setCode,
    rarity: row.rarity as import("@/types/supabase").Tables<"product_catalog">["rarity"],
    grade: {
      authority: grade.authority,
      score: grade.score || "",
    },
    gradingCompany: row.gradingCompany,
    gradingScore: row.gradingScore,
    price: row.price,
    delta: 0,
    deltaDirection: "up" as const,
    marketAvgPrice: row.marketAvgPrice,
    marketReferenceSource: row.marketReferenceSource,
    priceVsMarketPct: row.priceVsMarketPct,
    image: options?.imageUrl ?? row.imageUrl,
    catalogImageUrl: row.catalogImageUrl,
    seller: row.sellerName,
    sellerId: row.sellerId,
    sellerPersona: row.sellerPersona,
    detailHref: `/marketplace/${row.sellerId}/product/${row.listingId}`,
    baseCourierShippingFee: row.baseCourierShippingFee,
    listingExtraShippingFee: row.listingExtraShippingFee,
    courierShippingTotal: row.courierShippingTotal,
    deliverySummary: row.deliverySummary,
  };
}

export function readSellerPriceBounds(row: SellerListingRpcRow | undefined): {
  minPrice: number;
  maxPrice: number;
} {
  const min = Number(row?.seller_min_price ?? 0);
  const max = Number(row?.seller_max_price ?? 0);

  if (!Number.isFinite(min) || !Number.isFinite(max) || min > max) {
    return { minPrice: 0, maxPrice: 100000 };
  }

  return { minPrice: min, maxPrice: max };
}
