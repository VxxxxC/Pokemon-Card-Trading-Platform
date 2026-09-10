import type { Database } from "@/types/supabase";
import type { SortKey } from "@/app/store/useMarketStore";
import type { ListingImage } from "@/lib/listings/images";
import type { CatalogType } from "@/lib/constants/commerce";

export type GradeFilter = {
  company: string;
  score: string | null;
};

export type MarketplaceTrendSource = "snkrdunk" | "platform";

/** Merchant B2C shipping quote surfaced on marketplace surfaces. */
export type MarketplaceMerchantShippingFields = {
  baseCourierShippingFee?: number;
  listingExtraShippingFee?: number;
  courierShippingTotal?: number;
  deliverySummary?: string;
};

export type MarketplaceProductRow = {
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
  catalogType: Database["public"]["Enums"]["catalog_type"];
  listingCount: number;
  lowestPrice: number;
  highestPrice: number;
  lowestListingId: string;
  lowestListingCreatedAt: string;
  latestListingAt: string;
  gradingCompany: string;
  gradingScore: string | null;
  sellerId: string;
  sellerName: string;
  sellerPersona: Database["public"]["Enums"]["seller_persona_type"];
  useAuthentication: boolean;
  marketAvgPrice: number | null;
  marketReferenceSource: MarketplaceTrendSource | null;
  priceVsMarketPct: number | null;
} & MarketplaceMerchantShippingFields;

export type MarketplacePaginationMeta = {
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  rangeStart: number;
  rangeEnd: number;
};

export type MarketplaceSearchInput = {
  query?: string;
  setCode?: string;
  cardNumber?: string;
  rarities?: string[];
  sellerModes?: string[];
  catalogTypes?: CatalogType[];
  gradeFilters?: GradeFilter[];
  priceMin?: number;
  priceMax?: number;
  sortKey?: SortKey;
  page?: number;
  pageSize?: number;
};

export type SearchMarketplaceResult =
  | {
      success: true;
      data: MarketplaceProductRow[];
      meta: MarketplacePaginationMeta;
    }
  | { success: false; error: string };

export type MarketplacePriceBoundsResult =
  | { success: true; data: { minPrice: number; maxPrice: number } }
  | { success: false; error: string };

export type MarketplaceBootstrapData = {
  products: MarketplaceProductRow[];
  meta: MarketplacePaginationMeta;
  priceBounds: { minPrice: number; maxPrice: number };
  rarities: string[];
};

export type MarketplaceBootstrapResult =
  | { success: true; data: MarketplaceBootstrapData }
  | { success: false; error: string };

/** Mapped `product_catalog` row for marketplace product detail page. */
export type MarketplaceProductDetail = {
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
  /** Gallery slots — catalog currently exposes one official image. */
  images: string[];
  catalogType: Database["public"]["Enums"]["catalog_type"];
  elementType: string | null;
  pokemonStage: string | null;
  hp: number | null;
  subTypeJa: string | null;
};

export type MarketplaceProductDetailResult =
  | { success: true; data: MarketplaceProductDetail }
  | { success: false; error: string };

export type ProductListingSortKey = "price_asc" | "grade_desc" | "rating_desc";

export type MarketplaceProductListingRow = {
  listingId: string;
  price: number;
  gradingCompany: string;
  gradingScore: string | null;
  sellerId: string;
  sellerName: string;
  sellerUsername: string | null;
  sellerAvatarUrl: string;
  sellerRating: number;
  sellerTotalTrades: number;
  sellerPublicReviewCount: number;
  sellerPersona: Database["public"]["Enums"]["seller_persona_type"];
  useAuthentication: boolean;
  createdAt: string;
} & MarketplaceMerchantShippingFields;

/** Full listing payload for slide-over / detail views (fetched on demand). */
export type MarketplaceListingDetail = {
  listingId: string;
  productId: string;
  price: number;
  gradingCompany: string;
  gradingScore: string | null;
  sellerId: string;
  sellerDisplayName: string;
  sellerUsername: string | null;
  sellerDescription: string | null;
  images: string[];
  imagesDetail?: ListingImage[];
  useAuthentication: boolean;
} & MarketplaceMerchantShippingFields;

export type MarketplaceListingDetailResult =
  | { success: true; data: MarketplaceListingDetail }
  | { success: false; error: string };

export type MarketplaceProductListingsInput = {
  productId: string;
  gradeFilters?: GradeFilter[];
  onlyGraded?: boolean;
  sort?: ProductListingSortKey;
  page?: number;
  pageSize?: number;
};

export type MarketplaceProductListingsResult =
  | {
      success: true;
      data: MarketplaceProductListingRow[];
      meta: MarketplacePaginationMeta;
      lowestPrice: number | null;
    }
  | { success: false; error: string };

export type MarketplaceProductTradeHistoryRow = {
  orderId: string;
  createdAt: string;
  /** Preformatted label — prefer GradeBadge + grading fields in UI */
  grade: string;
  gradingCompany: string;
  gradingScore: string | null;
  price: number;
};

export type MarketplaceProductTradeHistoryInput = {
  productId: string;
  page?: number;
  pageSize?: number;
};

export type MarketplaceProductTradeHistoryResult =
  | {
      success: true;
      data: MarketplaceProductTradeHistoryRow[];
      meta: MarketplacePaginationMeta;
    }
  | { success: false; error: string };

export type MarketplacePriceChartPoint = {
  date: string;
  price: number;
};

export type MarketplaceMarketPrice = {
  marketAvgPrice: number | null;
  marketTrend30d: number | null;
  chartPoints: MarketplacePriceChartPoint[];
};

/** One cached market price row per product + grade. */
export type MarketplaceMarketPriceGradeRow = {
  gradeKey: string;
  label: string;
  gradingCompany: string;
  gradingScore: string | null;
  marketAvgPrice: number | null;
  marketTrend30d: number | null;
  chartPoints: MarketplacePriceChartPoint[];
};

export type MarketplaceMarketPriceInput = {
  productId: string;
  gradingCompany: string;
  gradingScore: string | null;
};

export type MarketplaceMarketPriceResult =
  | { success: true; data: MarketplaceMarketPrice }
  | { success: false; error: string };

export type MarketplaceProductMarketPricesResult =
  | { success: true; data: MarketplaceMarketPriceGradeRow[] }
  | { success: false; error: string };

import type { MarketplaceSellerProfile } from "@/lib/marketplace/load-seller-profile";

export type {
  MarketplaceSellerBadge,
  MarketplaceSellerProfile,
} from "@/lib/marketplace/load-seller-profile";

export type MarketplaceSellerProfileResult =
  | { success: true; data: MarketplaceSellerProfile }
  | { success: false; error: string };

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

export type MarketplaceSellerListingsInput = {
  sellerId: string;
  sellerPersona?: Database["public"]["Enums"]["seller_persona_type"];
  query?: string;
  rarities?: string[];
  gradeFilters?: GradeFilter[];
  priceMin?: number;
  priceMax?: number;
  sortKey?: SortKey;
  page?: number;
  pageSize?: number;
};

export type MarketplaceSellerListingsData = {
  listings: MarketplaceSellerListingRow[];
  meta: MarketplacePaginationMeta;
  priceBounds: { minPrice: number; maxPrice: number };
};

export type MarketplaceSellerListingsResult =
  | { success: true; data: MarketplaceSellerListingsData }
  | { success: false; error: string };

export type MarketplaceSellerListingDetailView = {
  seller: MarketplaceSellerProfile;
  catalog: MarketplaceProductDetail;
  storefrontListing: import("@/app/components/marketplace/MarketplaceCard").MarketplaceListing;
  photos: string[];
  photosDetail?: ListingImage[];
  batchLabel: string;
  price: number;
  gradingCompany: string;
  gradingScore: string | null;
  useAuthentication: boolean;
};

export type MarketplaceSellerListingDetailResult =
  | { success: true; data: MarketplaceSellerListingDetailView }
  | { success: false; error: string };
