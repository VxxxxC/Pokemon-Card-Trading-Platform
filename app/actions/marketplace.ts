"use server";

import { unstable_cache } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createPublicClient } from "@/lib/supabase/public";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { MARKETPLACE_FILTER_CACHE_SECONDS } from "@/lib/marketplace/constants";
import {
  isDefaultBrowsableMarketplaceSearch,
  MARKETPLACE_SEARCH_CACHE_SECONDS,
} from "@/lib/marketplace/search-default";
import {
  isDefaultProductDetailListingsInput,
} from "@/lib/marketplace/product-detail-default";
import type { MarketplaceTrendSource } from "@/app/lib/marketplace/types";
import {
  MARKETPLACE_PRODUCT_CATALOG_CACHE_SECONDS,
  MARKETPLACE_PRODUCT_DEFAULT_LISTINGS_CACHE_SECONDS,
  MARKETPLACE_PRODUCT_MARKET_PRICES_CACHE_SECONDS,
} from "@/lib/marketplace/constants";
import {
  normalizeMarketplaceText,
  parseCatalogSearchQuery,
} from "@/app/lib/marketplace/searchParsers";
import {
  listingSellerSnippetKey,
  loadListingSellerSnippets,
  type ListingSellerSnippet,
} from "@/lib/profile/load-profile-snippets";
import { DEFAULT_AVATAR_URL } from "@/lib/profile/avatar";
import type {
  MarketplacePaginationMeta,
  MarketplacePriceBoundsResult,
  MarketplaceProductDetail,
  MarketplaceProductDetailResult,
  MarketplaceProductListingRow,
  MarketplaceProductListingsInput,
  MarketplaceProductListingsResult,
  MarketplaceListingDetail,
  MarketplaceListingDetailResult,
  MarketplaceProductRow,
  MarketplaceProductTradeHistoryInput,
  MarketplaceProductTradeHistoryResult,
  MarketplaceProductTradeHistoryRow,
  MarketplaceMarketPrice,
  MarketplaceMarketPriceGradeRow,
  MarketplaceMarketPriceInput,
  MarketplaceMarketPriceResult,
  MarketplacePriceChartPoint,
  MarketplaceProductMarketPricesResult,
  MarketplaceSearchInput,
  MarketplaceBootstrapData,
  MarketplaceBootstrapResult,
  MarketplaceSellerListingsInput,
  MarketplaceSellerListingsResult,
  MarketplaceSellerProfileResult,
  MarketplaceSellerListingDetailResult,
  SearchMarketplaceResult,
} from "@/app/lib/marketplace/types";
import {
  loadMarketplaceSellerListingDetail,
  resolveSellerListingCatalogKey,
} from "@/lib/marketplace/load-seller-listing-detail";
import { loadMarketplaceSellerProfile } from "@/lib/marketplace/load-seller-profile";
import {
  mapSellerListingRpcRow,
  readSellerPriceBounds,
  type SellerListingRpcRow,
} from "@/lib/marketplace/map-seller-listing";
import type { Database, Json, Tables } from "@/types/supabase";
import type { SortKey } from "@/app/store/useMarketStore";
import {
  formatTradeGradeLabel,
} from "@/lib/marketplace/listing-display";
import {
  buildMarketPriceGradeKey,
  dbGradingScoreToOptionScore,
  formatMarketGradeLabel,
  resolveMarketPriceDbScore,
  sortMarketPriceGradeRows,
} from "@/lib/marketplace/market-price";
import { normalizeGradingCompany } from "@/lib/grading/options";
import { parseListingImageUrls, parseListingImageObjects } from "@/lib/listings/images";
import {
  isMarketplacePerfLogEnabled,
  marketplacePerfLog,
  marketplacePerfNow,
} from "@/lib/marketplace/perf-log";
import { loadMerchantShippingQuotes } from "@/lib/marketplace/enrich-merchant-shipping";
import type { ShippingQuoteSupabase } from "@/lib/marketplace/enrich-merchant-shipping";
import { resolveListingCoverImageUrl } from "@/lib/listings/images";
import {
  buildMerchantShippingQuote,
  resolveMerchantDeliverySummary,
  type MerchantShippingQuote,
} from "@/lib/merchant/format-delivery-summary";
import { PLATFORM_DEFAULT_COURIER_SHIPPING_FEE } from "@/lib/merchant/shipping-fee";
import type { MarketplaceMerchantShippingFields } from "@/app/lib/marketplace/types";

export type {
  GradeFilter,
  MarketplacePaginationMeta,
  MarketplacePriceBoundsResult,
  MarketplaceProductDetail,
  MarketplaceProductDetailResult,
  MarketplaceProductListingRow,
  MarketplaceProductListingsInput,
  MarketplaceProductListingsResult,
  MarketplaceListingDetail,
  MarketplaceListingDetailResult,
  MarketplaceProductRow,
  MarketplaceProductTradeHistoryInput,
  MarketplaceProductTradeHistoryResult,
  MarketplaceProductTradeHistoryRow,
  MarketplaceMarketPrice,
  MarketplaceMarketPriceGradeRow,
  MarketplaceMarketPriceInput,
  MarketplaceMarketPriceResult,
  MarketplacePriceChartPoint,
  MarketplaceProductMarketPricesResult,
  MarketplaceSearchInput,
  MarketplaceBootstrapData,
  MarketplaceBootstrapResult,
  MarketplaceSellerListingsInput,
  MarketplaceSellerListingsResult,
  MarketplaceSellerProfile,
  MarketplaceSellerProfileResult,
  MarketplaceSellerListingDetailResult,
  ProductListingSortKey,
  SearchMarketplaceResult,
} from "@/app/lib/marketplace/types";

type SearchRpcArgs =
  Database["public"]["Functions"]["search_marketplace_products"]["Args"];
type SearchRpcRow =
  Database["public"]["Functions"]["search_marketplace_products"]["Returns"][number];
type BrowseRpcRow = SearchRpcRow;
type ProductListingsRpcArgs =
  Database["public"]["Functions"]["get_marketplace_product_listings"]["Args"];
type ProductListingsRpcRow =
  Database["public"]["Functions"]["get_marketplace_product_listings"]["Returns"][number];

const DEFAULT_PAGE_SIZE = 12;
const MAX_PAGE_SIZE = 50;
const DEFAULT_PRODUCT_LISTINGS_PAGE_SIZE = 5;
const MAX_PRODUCT_LISTINGS_PAGE_SIZE = 50;
const DEFAULT_TRADE_HISTORY_PAGE_SIZE = 5;
const MAX_TRADE_HISTORY_PAGE_SIZE = 50;

type TradeHistoryQueryRow = {
  id: string;
  final_price: number;
  created_at: string | null;
  listings: {
    product_id: string;
    grading_company: string;
    grading_score: string | null;
  };
};

type ListingDetailQueryRow = Pick<
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
  | "extra_shipping_fee"
  | "seller_persona"
>;

function applyShippingQuote<T extends MarketplaceMerchantShippingFields>(
  row: T,
  quote: MerchantShippingQuote | undefined,
): T {
  if (!quote) {
    return row;
  }

  return {
    ...row,
    baseCourierShippingFee: quote.baseCourierShippingFee,
    listingExtraShippingFee: quote.listingExtraShippingFee,
    courierShippingTotal: quote.courierTotal,
    deliverySummary: resolveMerchantDeliverySummary(quote),
  };
}

async function enrichProductRowsWithSellerSnippets(
  supabase: ShippingQuoteSupabase,
  rows: MarketplaceProductRow[],
): Promise<MarketplaceProductRow[]> {
  if (rows.length === 0) {
    return rows;
  }

  const sellerSnippets = await loadListingSellerSnippets(
    supabase,
    rows.map((row) => ({
      sellerId: row.sellerId,
      sellerPersona: row.sellerPersona,
    })),
  );

  return rows.map((row) => {
    const sellerSnippet = sellerSnippets.get(
      listingSellerSnippetKey(row.sellerId, row.sellerPersona),
    );
    if (!sellerSnippet) {
      return row;
    }
    return {
      ...row,
      sellerName: sellerSnippet.displayName,
    };
  });
}

async function enrichProductRowsWithShipping(
  supabase: ShippingQuoteSupabase,
  rows: MarketplaceProductRow[],
): Promise<MarketplaceProductRow[]> {
  if (rows.length === 0) {
    return rows;
  }

  const quotes = await loadMerchantShippingQuotes(
    supabase,
    rows.map((row) => ({
      listingId: row.lowestListingId,
      sellerId: row.sellerId,
      sellerPersona: row.sellerPersona,
    })),
  );

  return rows.map((row) =>
    applyShippingQuote(row, quotes.get(row.lowestListingId)),
  );
}

async function enrichProductListingRowsWithShipping(
  supabase: ShippingQuoteSupabase,
  rows: MarketplaceProductListingRow[],
): Promise<MarketplaceProductListingRow[]> {
  if (rows.length === 0) {
    return rows;
  }

  const quotes = await loadMerchantShippingQuotes(
    supabase,
    rows.map((row) => ({
      listingId: row.listingId,
      sellerId: row.sellerId,
      sellerPersona: row.sellerPersona,
    })),
  );

  return rows.map((row) =>
    applyShippingQuote(row, quotes.get(row.listingId)),
  );
}

async function enrichSellerListingRowsWithCoverImages(
  supabase: ShippingQuoteSupabase,
  rows: ReturnType<typeof mapSellerListingRpcRow>[],
): Promise<ReturnType<typeof mapSellerListingRpcRow>[]> {
  if (rows.length === 0) {
    return rows;
  }

  const listingIds = rows.map((row) => row.listingId);
  const { data, error } = await supabase
    .from("listings")
    .select("id, images")
    .in("id", listingIds);

  if (error || !data) {
    return rows;
  }

  const imagesByListingId = new Map(
    data.map((row) => [row.id, row.images]),
  );

  return rows.map((row) => {
    const catalogUrl =
      row.catalogImageUrl?.trim() ||
      (row.imageUrl.trim() && row.imageUrl !== "/placeholder-card.png"
        ? row.imageUrl
        : null);
    const coverUrl =
      resolveListingCoverImageUrl(
        imagesByListingId.get(row.listingId),
        catalogUrl,
      ) ?? row.imageUrl;

    return {
      ...row,
      imageUrl: coverUrl,
    };
  });
}

async function enrichSellerListingRowsWithShipping(
  supabase: ShippingQuoteSupabase,
  rows: ReturnType<typeof mapSellerListingRpcRow>[],
): Promise<ReturnType<typeof mapSellerListingRpcRow>[]> {
  if (rows.length === 0) {
    return rows;
  }

  const rowsWithCoverImages = await enrichSellerListingRowsWithCoverImages(
    supabase,
    rows,
  );

  const quotes = await loadMerchantShippingQuotes(
    supabase,
    rowsWithCoverImages.map((row) => ({
      listingId: row.listingId,
      sellerId: row.sellerId,
      sellerPersona: row.sellerPersona,
    })),
  );

  return rowsWithCoverImages.map((row) =>
    applyShippingQuote(row, quotes.get(row.listingId)),
  );
}

function mapSortKey(sortKey: SortKey | undefined): string {
  switch (sortKey) {
    case "價格：由低到高":
      return "price_asc";
    case "價格：由高到低":
      return "price_desc";
    case "最新":
    default:
      return "latest";
  }
}

type ProductCatalogRow = Database["public"]["Tables"]["product_catalog"]["Row"];

function displayProductName(row: {
  name_ja: string;
  name_zh: string | null;
}): string {
  return row.name_zh ?? row.name_ja;
}

function toProductDetail(row: ProductCatalogRow): MarketplaceProductDetail {
  return {
    productId: row.id,
    productName: displayProductName(row),
    nameJa: row.name_ja,
    nameEn: row.name_en,
    nameZh: row.name_zh,
    setCode: row.set_code,
    cardNumber: row.card_number,
    displayId: row.display_id,
    rarity: row.rarity,
    imageUrl: row.image_url,
    images: [row.image_url],
    catalogType: row.type,
    elementType: row.element_type,
    pokemonStage: row.pokemon_stage,
    hp: row.hp,
    subTypeJa: row.sub_type_ja,
  };
}

function toProductListingRow(
  row: ProductListingsRpcRow,
  sellerSnippets: ReadonlyMap<string, ListingSellerSnippet>,
): MarketplaceProductListingRow {
  const sellerSnippet = sellerSnippets.get(
    listingSellerSnippetKey(row.seller_id, row.seller_persona),
  );

  return {
    listingId: row.listing_id,
    price: Number(row.price),
    gradingCompany: row.grading_company,
    gradingScore: row.grading_score,
    sellerId: row.seller_id,
    sellerName: sellerSnippet?.displayName ?? row.seller_name,
    sellerUsername: sellerSnippet?.username ?? null,
    sellerAvatarUrl: sellerSnippet?.avatarUrl ?? DEFAULT_AVATAR_URL,
    sellerRating: Number(row.seller_rating ?? 0),
    sellerTotalTrades: Number(row.seller_total_trades ?? 0),
    sellerPublicReviewCount: Number(row.seller_public_review_count ?? 0),
    sellerPersona: row.seller_persona,
    useAuthentication: row.use_authentication,
    createdAt: row.created_at,
  };
}

function resolveMarketReferenceSource(
  value: string | null | undefined,
): MarketplaceTrendSource | null {
  if (value === "snkrdunk" || value === "platform") {
    return value;
  }
  return null;
}

function toProductRow(row: SearchRpcRow): MarketplaceProductRow {
  return {
    productId: row.product_id,
    productName: row.product_name,
    nameJa: row.name_ja,
    nameEn: row.name_en,
    nameZh: row.name_zh,
    setCode: row.set_code,
    cardNumber: row.card_number,
    displayId: row.display_id,
    rarity: row.rarity,
    imageUrl: row.image_url,
    catalogType: row.catalog_type,
    listingCount: Number(row.listing_count),
    lowestPrice: Number(row.lowest_price),
    highestPrice: Number(row.highest_price),
    lowestListingId: row.lowest_listing_id,
    lowestListingCreatedAt: row.lowest_listing_created_at,
    latestListingAt: row.latest_listing_at,
    gradingCompany: row.grading_company,
    gradingScore: row.grading_score,
    sellerId: row.seller_id,
    sellerName: row.seller_name,
    sellerPersona: row.seller_persona,
    useAuthentication: row.use_authentication,
    marketAvgPrice: toFiniteNumber(row.market_avg_price),
    marketReferenceSource: resolveMarketReferenceSource(row.market_data_source),
    priceVsMarketPct: toFiniteNumber(row.price_vs_market_pct),
  };
}

type PaginationRpcRow = {
  total_count: number | string;
  page: number | string;
  page_size: number | string;
  total_pages: number | string;
  range_start: number | string;
  range_end: number | string;
};

function toPaginationMeta(
  row: PaginationRpcRow | undefined,
  fallbackPage: number,
  fallbackPageSize: number,
): MarketplacePaginationMeta {
  if (!row) {
    return {
      total: 0,
      page: fallbackPage,
      pageSize: fallbackPageSize,
      totalPages: 0,
      rangeStart: 0,
      rangeEnd: 0,
    };
  }

  return {
    total: Number(row.total_count),
    page: Number(row.page),
    pageSize: Number(row.page_size),
    totalPages: Number(row.total_pages),
    rangeStart: Number(row.range_start),
    rangeEnd: Number(row.range_end),
  };
}

function toPaginationMetaFromCount(
  total: number,
  page: number,
  pageSize: number,
): MarketplacePaginationMeta {
  const totalPages = total === 0 ? 0 : Math.ceil(total / pageSize);
  return {
    total,
    page,
    pageSize,
    totalPages,
    rangeStart: total === 0 ? 0 : (page - 1) * pageSize + 1,
    rangeEnd: total === 0 ? 0 : Math.min(page * pageSize, total),
  };
}

function toTradeHistoryRow(
  row: TradeHistoryQueryRow,
): MarketplaceProductTradeHistoryRow {
  const gradingCompany = row.listings.grading_company;
  const gradingScore = row.listings.grading_score?.trim() || null;

  return {
    orderId: row.id,
    createdAt: row.created_at ?? "",
    gradingCompany,
    gradingScore,
    grade: formatTradeGradeLabel(gradingCompany, gradingScore),
    price: Number(row.final_price),
  };
}

async function runBrowseMarketplaceSearch(
  sort: string,
  page: number,
  pageSize: number,
): Promise<SearchMarketplaceResult> {
  const supabase = createPublicClient();
  const rpcStartedAt = isMarketplacePerfLogEnabled()
    ? marketplacePerfNow()
    : 0;

  const { data, error } = await (
    supabase as unknown as {
      rpc: (
        fn: "search_marketplace_products_browse",
        args: { p_sort: string; p_page: number; p_page_size: number },
      ) => Promise<{
        data: BrowseRpcRow[] | null;
        error: { message: string } | null;
      }>;
    }
  ).rpc("search_marketplace_products_browse", {
    p_sort: sort,
    p_page: page,
    p_page_size: pageSize,
  });

  if (isMarketplacePerfLogEnabled()) {
    marketplacePerfLog(
      `searchMarketplaceProductsBrowse page=${page} size=${pageSize} sort=${sort}=${Math.round(marketplacePerfNow() - rpcStartedAt)}ms`,
    );
  }

  if (error) {
    if (isMarketplacePerfLogEnabled()) {
      marketplacePerfLog(
        `searchMarketplaceProductsBrowse failed=${error.message}`,
      );
    }
    return { success: false, error: "搜尋大盤市場時發生錯誤" };
  }

  const rows = (data ?? []) as BrowseRpcRow[];
  const productsWithSellers = await enrichProductRowsWithSellerSnippets(
    supabase,
    rows.map(toProductRow),
  );
  const products = await enrichProductRowsWithShipping(
    supabase,
    productsWithSellers,
  );

  return {
    success: true,
    data: products,
    meta: toPaginationMeta(rows[0], page, pageSize),
  };
}

function getCachedBrowseMarketplaceSearch(
  sort: string,
  page: number,
  pageSize: number,
): Promise<SearchMarketplaceResult> {
  return unstable_cache(
    async () => {
      const result = await runBrowseMarketplaceSearch(sort, page, pageSize);
      if (!result.success) {
        throw new Error("marketplace_browse_unavailable");
      }
      return result;
    },
    ["marketplace-browse", sort, String(page), String(pageSize)],
    { revalidate: MARKETPLACE_SEARCH_CACHE_SECONDS },
  )().catch(() =>
    runBrowseMarketplaceSearch(sort, page, pageSize),
  );
}

export async function searchMarketplaceProducts(
  input: MarketplaceSearchInput = {},
): Promise<SearchMarketplaceResult> {
  const page = Math.max(1, input.page ?? 1);
  const pageSize = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, input.pageSize ?? DEFAULT_PAGE_SIZE),
  );

  if (isDefaultBrowsableMarketplaceSearch(input, page, pageSize)) {
    try {
      const sort = mapSortKey(input.sortKey);
      const cached = await getCachedBrowseMarketplaceSearch(sort, page, pageSize);
      if (cached.success) {
        return cached;
      }
    } catch (error) {
      console.error("[searchMarketplaceProducts] browse cache", error);
    }
  }

  const parsedQuery = parseCatalogSearchQuery(input.query);

  try {
    const supabase = await createClient();

    const gradeFilters =
      input.gradeFilters && input.gradeFilters.length > 0
        ? input.gradeFilters
        : undefined;

    const rpcArgs: SearchRpcArgs = {
      p_keyword: parsedQuery.keyword ?? undefined,
      p_set_code:
        normalizeMarketplaceText(input.setCode) ??
        parsedQuery.setCode ??
        undefined,
      p_card_number:
        normalizeMarketplaceText(input.cardNumber) ??
        parsedQuery.cardNumber ??
        undefined,
      p_rarities:
        input.rarities && input.rarities.length > 0 ? input.rarities : undefined,
      p_seller_modes:
        input.sellerModes && input.sellerModes.length > 0
          ? input.sellerModes
          : undefined,
      p_catalog_types:
        input.catalogTypes && input.catalogTypes.length > 0
          ? input.catalogTypes
          : undefined,
      p_grade_filters: gradeFilters,
      p_price_min: input.priceMin ?? undefined,
      p_price_max: input.priceMax ?? undefined,
      p_sort: mapSortKey(input.sortKey),
      p_page: page,
      p_page_size: pageSize,
    };

    const sort = mapSortKey(input.sortKey);
    const rpcStartedAt = isMarketplacePerfLogEnabled()
      ? marketplacePerfNow()
      : 0;

    const { data, error } = await (
      supabase as unknown as {
        rpc: (
          fn: "search_marketplace_products",
          args: SearchRpcArgs,
        ) => Promise<{
          data: SearchRpcRow[] | null;
          error: { message: string } | null;
        }>;
      }
    ).rpc("search_marketplace_products", rpcArgs);

    if (isMarketplacePerfLogEnabled()) {
      marketplacePerfLog(
        `searchMarketplaceProducts page=${page} size=${pageSize} sort=${sort}=${Math.round(marketplacePerfNow() - rpcStartedAt)}ms`,
      );
    }

    if (error) {
      console.error("[searchMarketplaceProducts]", error.message);
      return { success: false, error: "搜尋大盤市場時發生錯誤" };
    }

    const rows = (data ?? []) as SearchRpcRow[];
    const productsWithSellers = await enrichProductRowsWithSellerSnippets(
      supabase,
      rows.map(toProductRow),
    );
    const products = await enrichProductRowsWithShipping(
      supabase,
      productsWithSellers,
    );

    return {
      success: true,
      data: products,
      meta: toPaginationMeta(rows[0], page, pageSize),
    };
  } catch (error) {
    console.error("[searchMarketplaceProducts]", error);
    return { success: false, error: "無法連線至大盤市場" };
  }
}

export async function getMarketplacePriceBounds(): Promise<MarketplacePriceBoundsResult> {
  try {
    const supabase = createPublicClient();
    const rpcStartedAt = isMarketplacePerfLogEnabled()
      ? marketplacePerfNow()
      : 0;

    const { data, error } = await (
      supabase as unknown as {
        rpc: (
          fn: "get_marketplace_price_bounds",
        ) => Promise<{
          data: { min_price: number; max_price: number }[] | null;
          error: { message: string } | null;
        }>;
      }
    ).rpc("get_marketplace_price_bounds");

    if (isMarketplacePerfLogEnabled()) {
      marketplacePerfLog(
        `getMarketplacePriceBounds=${Math.round(marketplacePerfNow() - rpcStartedAt)}ms`,
      );
    }

    if (error) {
      console.error("[getMarketplacePriceBounds]", error.message);
      return { success: false, error: "無法取得價格區間" };
    }

    const row = data?.[0];
    const minPrice = Number(row?.min_price ?? 0);
    const maxPrice = Number(row?.max_price ?? 100_000);

    return {
      success: true,
      data: {
        minPrice,
        maxPrice: maxPrice > minPrice ? maxPrice : minPrice + 100_000,
      },
    };
  } catch (error) {
    console.error("[getMarketplacePriceBounds]", error);
    return { success: false, error: "無法連線至大盤市場" };
  }
}

export async function getMarketplaceBootstrap(
  input: MarketplaceSearchInput = {},
): Promise<MarketplaceBootstrapResult> {
  if (!isSupabaseConfigured()) {
    return { success: false, error: "無法連線至大盤市場" };
  }

  try {
    const bootstrapStartedAt = isMarketplacePerfLogEnabled()
      ? marketplacePerfNow()
      : 0;

    const [filterMetadata, searchResult] = await Promise.all([
      loadCachedMarketplaceFilterMetadata(),
      searchMarketplaceProducts(input),
    ]);

    if (isMarketplacePerfLogEnabled()) {
      marketplacePerfLog(
        `bootstrap total=${Math.round(marketplacePerfNow() - bootstrapStartedAt)}ms (search + cached filter metadata)`,
      );
    }

    if (!searchResult.success) {
      return { success: false, error: searchResult.error };
    }

    return {
      success: true,
      data: {
        products: searchResult.data,
        meta: searchResult.meta,
        priceBounds: filterMetadata.priceBounds,
        rarities: filterMetadata.rarities,
      },
    };
  } catch (error) {
    console.error("[getMarketplaceBootstrap]", error);
    return { success: false, error: "無法連線至大盤市場" };
  }
}

export type MarketplaceRaritiesResult =
  | { success: true; data: string[] }
  | { success: false; error: string };

async function runLoadProductCatalogDetail(
  productKey: string,
): Promise<MarketplaceProductDetailResult> {
  const key = productKey.trim();
  if (!key) {
    return { success: false, error: "缺少商品識別碼" };
  }

  const supabase = createPublicClient();
  const { data, error } = await supabase
    .from("product_catalog")
    .select("*")
    .or(`id.eq.${key},display_id.eq.${key}`)
    .maybeSingle();

  if (error) {
    console.error("[getMarketplaceProductDetail]", error.message);
    return { success: false, error: "無法載入商品資料" };
  }

  if (!data) {
    return { success: false, error: "找不到此商品" };
  }

  return { success: true, data: toProductDetail(data) };
}

function getCachedProductCatalogDetail(
  productKey: string,
): Promise<MarketplaceProductDetailResult> {
  const key = productKey.trim();

  return unstable_cache(
    async () => {
      const result = await runLoadProductCatalogDetail(key);
      if (!result.success) {
        throw new Error("marketplace_product_detail_unavailable");
      }
      return result;
    },
    ["marketplace-product-detail", key],
    { revalidate: MARKETPLACE_PRODUCT_CATALOG_CACHE_SECONDS },
  )().catch(() => runLoadProductCatalogDetail(key));
}

export async function getMarketplaceProductDetail(
  productKey: string,
): Promise<MarketplaceProductDetailResult> {
  const key = productKey.trim();
  if (!key) {
    return { success: false, error: "缺少商品識別碼" };
  }

  if (!isSupabaseConfigured()) {
    return { success: false, error: "無法載入商品資料" };
  }

  try {
    return await getCachedProductCatalogDetail(key);
  } catch (error) {
    console.error("[getMarketplaceProductDetail]", error);
    return { success: false, error: "無法連線至商品目錄" };
  }
}

async function runLoadProductListings(
  input: MarketplaceProductListingsInput,
): Promise<MarketplaceProductListingsResult> {
  const productId = input.productId.trim();
  if (!productId) {
    return { success: false, error: "缺少商品識別碼" };
  }

  const page = Math.max(1, input.page ?? 1);
  const pageSize = Math.min(
    MAX_PRODUCT_LISTINGS_PAGE_SIZE,
    Math.max(1, input.pageSize ?? DEFAULT_PRODUCT_LISTINGS_PAGE_SIZE),
  );
  const sort = input.sort ?? "price_asc";
  const onlyGraded = input.onlyGraded ?? false;
  const gradeFilters =
    input.gradeFilters && input.gradeFilters.length > 0
      ? input.gradeFilters
      : undefined;

  const supabase = createPublicClient();

  const rpcArgs: ProductListingsRpcArgs = {
    p_product_id: productId,
    p_grade_filters: gradeFilters,
    p_only_graded: onlyGraded,
    p_sort: sort,
    p_page: page,
    p_page_size: pageSize,
  };

  const { data, error } = await (
    supabase as unknown as {
      rpc: (
        fn: "get_marketplace_product_listings",
        args: ProductListingsRpcArgs,
      ) => Promise<{
        data: ProductListingsRpcRow[] | null;
        error: { message: string } | null;
      }>;
    }
  ).rpc("get_marketplace_product_listings", rpcArgs);

  if (error) {
    console.error("[getMarketplaceProductListings]", error.message);
    return { success: false, error: "無法載入商品掛單" };
  }

  const rows = (data ?? []) as ProductListingsRpcRow[];
  const sellerSnippets = await loadListingSellerSnippets(
    supabase,
    rows.map((row) => ({
      sellerId: row.seller_id,
      sellerPersona: row.seller_persona,
    })),
  );
  const listingRows = rows.map((row) => toProductListingRow(row, sellerSnippets));
  const enrichedListingRows = await enrichProductListingRowsWithShipping(
    supabase,
    listingRows,
  );
  const lowestRaw = rows[0]?.filtered_lowest_price;

  return {
    success: true,
    data: enrichedListingRows,
    meta: toPaginationMeta(rows[0], page, pageSize),
    lowestPrice:
      lowestRaw != null && Number.isFinite(Number(lowestRaw))
        ? Number(lowestRaw)
        : null,
  };
}

function getCachedDefaultProductListings(
  productId: string,
): Promise<MarketplaceProductListingsResult> {
  return unstable_cache(
    async () => {
      const result = await runLoadProductListings({
        productId,
        sort: "price_asc",
        onlyGraded: false,
        page: 1,
        pageSize: DEFAULT_PRODUCT_LISTINGS_PAGE_SIZE,
      });
      if (!result.success) {
        throw new Error("marketplace_product_listings_unavailable");
      }
      return result;
    },
    ["marketplace-product-listings-default", productId],
    { revalidate: MARKETPLACE_PRODUCT_DEFAULT_LISTINGS_CACHE_SECONDS },
  )().catch(() =>
    runLoadProductListings({
      productId,
      sort: "price_asc",
      onlyGraded: false,
      page: 1,
      pageSize: DEFAULT_PRODUCT_LISTINGS_PAGE_SIZE,
    }),
  );
}

export async function getMarketplaceProductListings(
  input: MarketplaceProductListingsInput,
): Promise<MarketplaceProductListingsResult> {
  const productId = input.productId.trim();
  if (!productId) {
    return { success: false, error: "缺少商品識別碼" };
  }

  if (!isSupabaseConfigured()) {
    return { success: false, error: "無法載入商品掛單" };
  }

  try {
    if (isDefaultProductDetailListingsInput(input)) {
      return await getCachedDefaultProductListings(productId);
    }

    return await runLoadProductListings(input);
  } catch (error) {
    console.error("[getMarketplaceProductListings]", error);
    return { success: false, error: "無法連線至大盤市場" };
  }
}

export async function getMarketplaceListingDetail(
  listingId: string,
): Promise<MarketplaceListingDetailResult> {
  const id = listingId.trim();
  if (!id) {
    return { success: false, error: "缺少掛單識別碼" };
  }

  try {
    const supabase = createPublicClient();

    const { data, error } = await supabase
      .from("listings")
      .select(
        "id, product_id, price, grading_company, grading_score, seller_id, seller_description, images, use_authentication, extra_shipping_fee, seller_persona",
      )
      .eq("id", id)
      .eq("status", "active")
      .maybeSingle<ListingDetailQueryRow>();

    if (error) {
      console.error("[getMarketplaceListingDetail]", error.message);
      return { success: false, error: "無法載入掛單資料" };
    }

    if (!data) {
      return { success: false, error: "找不到此掛單" };
    }

    const sellerSnippets = await loadListingSellerSnippets(supabase, [
      {
        sellerId: data.seller_id,
        sellerPersona: data.seller_persona,
      },
    ]);
    const sellerSnippet = sellerSnippets.get(
      listingSellerSnippetKey(data.seller_id, data.seller_persona),
    );

    let shippingFields: MarketplaceMerchantShippingFields = {};
    if (data.seller_persona === "merchant") {
      const quotes = await loadMerchantShippingQuotes(supabase, [
        {
          listingId: data.id,
          sellerId: data.seller_id,
          sellerPersona: data.seller_persona,
        },
      ]);
      const quote = quotes.get(data.id);
      if (quote) {
        shippingFields = {
          baseCourierShippingFee: quote.baseCourierShippingFee,
          listingExtraShippingFee: quote.listingExtraShippingFee,
          courierShippingTotal: quote.courierTotal,
          deliverySummary: resolveMerchantDeliverySummary(quote),
        };
      } else {
        const quoteFromListing = buildMerchantShippingQuote({
          baseCourierShippingFee: PLATFORM_DEFAULT_COURIER_SHIPPING_FEE,
          listingExtraShippingFee: Number(data.extra_shipping_fee ?? 0),
        });
        shippingFields = {
          baseCourierShippingFee: quoteFromListing.baseCourierShippingFee,
          listingExtraShippingFee: quoteFromListing.listingExtraShippingFee,
          courierShippingTotal: quoteFromListing.courierTotal,
          deliverySummary: resolveMerchantDeliverySummary(quoteFromListing),
        };
      }
    }

    const sellerDisplayName = sellerSnippet?.displayName?.trim() ?? "";
    const sellerUsername = sellerSnippet?.username ?? null;

    return {
      success: true,
      data: {
        listingId: data.id,
        productId: data.product_id,
        price: Number(data.price),
        gradingCompany: data.grading_company,
        gradingScore: data.grading_score,
        sellerId: data.seller_id,
        sellerDisplayName,
        sellerUsername,
        sellerDescription: data.seller_description,
        images: parseListingImageUrls(data.images),
        imagesDetail: parseListingImageObjects(data.images),
        useAuthentication: data.use_authentication,
        ...shippingFields,
      },
    };
  } catch (error) {
    console.error("[getMarketplaceListingDetail]", error);
    return { success: false, error: "無法連線至大盤市場" };
  }
}

export async function getMarketplaceProductTradeHistory(
  input: MarketplaceProductTradeHistoryInput,
): Promise<MarketplaceProductTradeHistoryResult> {
  const productId = input.productId.trim();
  if (!productId) {
    return { success: false, error: "缺少商品識別碼" };
  }

  const page = Math.max(1, input.page ?? 1);
  const pageSize = Math.min(
    MAX_TRADE_HISTORY_PAGE_SIZE,
    Math.max(1, input.pageSize ?? DEFAULT_TRADE_HISTORY_PAGE_SIZE),
  );
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  try {
    const supabase = await createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError) {
      console.error("[getMarketplaceProductTradeHistory]", authError.message);
      return { success: false, error: "無法驗證登入狀態" };
    }

    if (!user) {
      return { success: false, error: "請登入以查閱成交紀錄" };
    }

    const { data, error, count } = await supabase
      .from("member_orders")
      .select(
        `
          id,
          final_price,
          created_at,
          listings!inner (
            product_id,
            grading_company,
            grading_score
          )
        `,
        { count: "exact" },
      )
      .eq("status", "completed")
      .eq("listings.product_id", productId)
      .order("created_at", { ascending: false })
      .range(from, to);

    if (error) {
      console.error("[getMarketplaceProductTradeHistory]", error.message);
      return { success: false, error: "無法載入成交紀錄" };
    }

    const rows = (data ?? []) as TradeHistoryQueryRow[];
    const total = count ?? 0;

    return {
      success: true,
      data: rows.map(toTradeHistoryRow),
      meta: toPaginationMetaFromCount(total, page, pageSize),
    };
  } catch (error) {
    console.error("[getMarketplaceProductTradeHistory]", error);
    return { success: false, error: "無法連線至大盤市場" };
  }
}

function parseMarketChartData(json: Json | null): MarketplacePriceChartPoint[] {
  if (!json || !Array.isArray(json)) {
    return [];
  }

  const points: MarketplacePriceChartPoint[] = [];

  for (const item of json) {
    if (
      typeof item !== "object" ||
      item === null ||
      !("date" in item) ||
      !("price" in item)
    ) {
      continue;
    }

    const date = (item as { date: unknown }).date;
    const price = (item as { price: unknown }).price;

    if (typeof date !== "string" || typeof price !== "number" || !Number.isFinite(price)) {
      continue;
    }

    points.push({ date, price });
  }

  return points;
}

const EMPTY_MARKET_PRICE: MarketplaceMarketPrice = {
  marketAvgPrice: null,
  marketTrend30d: null,
  chartPoints: [],
};

function toFiniteNumber(value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(Number(value))) {
    return null;
  }
  return Number(value);
}

function toMarketPriceGradeRow(
  row: Pick<
    Tables<"product_grading_market_prices">,
    | "grading_company"
    | "grading_score"
    | "market_avg_price"
    | "market_trend_30d"
    | "market_chart_data"
  >,
): MarketplaceMarketPriceGradeRow | null {
  const gradingCompany = normalizeGradingCompany(row.grading_company);
  const gradingScore = (row.grading_score ?? "").trim();
  const chartPoints = parseMarketChartData(row.market_chart_data);
  const marketAvgPrice = toFiniteNumber(row.market_avg_price);
  const marketTrend30d = toFiniteNumber(row.market_trend_30d);

  if (marketAvgPrice == null && chartPoints.length === 0) {
    return null;
  }

  return {
    gradeKey: buildMarketPriceGradeKey(gradingCompany, gradingScore),
    label: formatMarketGradeLabel(gradingCompany, gradingScore),
    gradingCompany,
    gradingScore: dbGradingScoreToOptionScore(gradingCompany, gradingScore),
    marketAvgPrice,
    marketTrend30d,
    chartPoints,
  };
}

async function runLoadProductMarketPrices(
  productId: string,
): Promise<MarketplaceProductMarketPricesResult> {
  const supabase = createPublicClient();

  const { data, error } = await supabase
    .from("product_grading_market_prices")
    .select(
      "grading_company, grading_score, market_avg_price, market_trend_30d, market_chart_data",
    )
    .eq("product_id", productId);

  if (error) {
    console.error("[getMarketplaceProductMarketPrices]", error.message);
    return { success: false, error: "無法載入市場價格" };
  }

  const rows = (data ?? []) as Pick<
    Tables<"product_grading_market_prices">,
    | "grading_company"
    | "grading_score"
    | "market_avg_price"
    | "market_trend_30d"
    | "market_chart_data"
  >[];

  const grades = sortMarketPriceGradeRows(
    rows
      .map(toMarketPriceGradeRow)
      .filter((row): row is MarketplaceMarketPriceGradeRow => row != null),
  );

  return { success: true, data: grades };
}

function getCachedProductMarketPrices(
  productId: string,
): Promise<MarketplaceProductMarketPricesResult> {
  return unstable_cache(
    async () => {
      const result = await runLoadProductMarketPrices(productId);
      if (!result.success) {
        throw new Error("marketplace_product_market_prices_unavailable");
      }
      return result;
    },
    ["marketplace-product-market-prices", productId],
    { revalidate: MARKETPLACE_PRODUCT_MARKET_PRICES_CACHE_SECONDS },
  )().catch(() => runLoadProductMarketPrices(productId));
}

export async function getMarketplaceProductMarketPrices(
  productIdInput: string,
): Promise<MarketplaceProductMarketPricesResult> {
  const productId = productIdInput.trim();
  if (!productId) {
    return { success: false, error: "缺少商品識別碼" };
  }

  if (!isSupabaseConfigured()) {
    return { success: true, data: [] };
  }

  try {
    return await getCachedProductMarketPrices(productId);
  } catch (error) {
    console.error("[getMarketplaceProductMarketPrices]", error);
    return { success: false, error: "無法連線至大盤市場" };
  }
}

export async function getMarketplaceProductMarketPrice(
  input: MarketplaceMarketPriceInput,
): Promise<MarketplaceMarketPriceResult> {
  const productId = input.productId.trim();
  if (!productId) {
    return { success: false, error: "缺少商品識別碼" };
  }

  if (!isSupabaseConfigured()) {
    return { success: true, data: EMPTY_MARKET_PRICE };
  }

  const gradingCompany = normalizeGradingCompany(input.gradingCompany);
  const gradingScore = resolveMarketPriceDbScore(
    gradingCompany,
    input.gradingScore,
    input.gradingScore,
  );

  try {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("product_grading_market_prices")
      .select("market_avg_price, market_trend_30d, market_chart_data")
      .eq("product_id", productId)
      .eq("grading_company", gradingCompany)
      .eq("grading_score", gradingScore)
      .maybeSingle();

    if (error) {
      console.error("[getMarketplaceProductMarketPrice]", error.message);
      return { success: false, error: "無法載入市場價格" };
    }

    if (!data) {
      return { success: true, data: EMPTY_MARKET_PRICE };
    }

    const row = data as Pick<
      Tables<"product_grading_market_prices">,
      "market_avg_price" | "market_trend_30d" | "market_chart_data"
    >;

    const marketAvgPrice = toFiniteNumber(row.market_avg_price);
    const marketTrend30d = toFiniteNumber(row.market_trend_30d);
    const chartPoints = parseMarketChartData(row.market_chart_data);

    return {
      success: true,
      data: {
        marketAvgPrice,
        marketTrend30d,
        chartPoints,
      },
    };
  } catch (error) {
    console.error("[getMarketplaceProductMarketPrice]", error);
    return { success: false, error: "無法連線至大盤市場" };
  }
}

export async function getMarketplaceRarities(): Promise<MarketplaceRaritiesResult> {
  try {
    const supabase = createPublicClient();
    const queryStartedAt = isMarketplacePerfLogEnabled()
      ? marketplacePerfNow()
      : 0;

    const { data, error } = await (
      supabase as unknown as {
        rpc: (
          fn: "get_marketplace_rarities",
        ) => Promise<{
          data: { rarity: string }[] | null;
          error: { message: string } | null;
        }>;
      }
    ).rpc("get_marketplace_rarities");

    if (isMarketplacePerfLogEnabled()) {
      marketplacePerfLog(
        `getMarketplaceRarities=${Math.round(marketplacePerfNow() - queryStartedAt)}ms`,
      );
    }

    if (error) {
      console.error("[getMarketplaceRarities]", error.message);
      return { success: false, error: "無法載入稀有度選項" };
    }

    const rows = (data ?? []) as { rarity: string }[];
    const unique = rows
      .map((row) => row.rarity?.trim())
      .filter((rarity): rarity is string => Boolean(rarity));

    return { success: true, data: unique };
  } catch (error) {
    console.error("[getMarketplaceRarities]", error);
    return { success: false, error: "無法連線至商品目錄" };
  }
}

type MarketplaceFilterMetadata = {
  priceBounds: { minPrice: number; maxPrice: number };
  rarities: string[];
};

const loadCachedMarketplaceFilterMetadata = unstable_cache(
  async (): Promise<MarketplaceFilterMetadata> => {
    const [boundsResult, raritiesResult] = await Promise.all([
      getMarketplacePriceBounds(),
      getMarketplaceRarities(),
    ]);

    return {
      priceBounds: boundsResult.success
        ? boundsResult.data
        : { minPrice: 0, maxPrice: 100_000 },
      rarities: raritiesResult.success ? raritiesResult.data : [],
    };
  },
  ["marketplace-filter-metadata"],
  { revalidate: MARKETPLACE_FILTER_CACHE_SECONDS },
);

export type MarketplaceFilterMetadataResult =
  | { success: true; data: MarketplaceFilterMetadata }
  | { success: false; error: string };

export async function getMarketplaceFilterMetadata(): Promise<MarketplaceFilterMetadataResult> {
  if (!isSupabaseConfigured()) {
    return { success: false, error: "無法連線至大盤市場" };
  }

  try {
    const data = await loadCachedMarketplaceFilterMetadata();
    return { success: true, data };
  } catch (error) {
    console.error("[getMarketplaceFilterMetadata]", error);
    return { success: false, error: "無法載入篩選資料" };
  }
}

export async function getMarketplaceSellerProfile(
  sellerKey: string,
  options?: { persona?: import("@/app/lib/reviews/types").ReviewPersona },
): Promise<MarketplaceSellerProfileResult> {
  if (!isSupabaseConfigured()) {
    return { success: false, error: "無法連線至大盤市場" };
  }

  try {
    const profile = await loadMarketplaceSellerProfile(
      sellerKey,
      options?.persona,
    );
    if (!profile) {
      return { success: false, error: "未找到該商戶" };
    }

    return { success: true, data: profile };
  } catch (error) {
    console.error("[getMarketplaceSellerProfile]", error);
    return { success: false, error: "無法載入商戶資料" };
  }
}

export async function searchMarketplaceSellerListings(
  input: MarketplaceSellerListingsInput,
): Promise<MarketplaceSellerListingsResult> {
  if (!isSupabaseConfigured()) {
    return { success: false, error: "無法連線至大盤市場" };
  }

  const page = Math.max(1, input.page ?? 1);
  const pageSize = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, input.pageSize ?? DEFAULT_PAGE_SIZE),
  );

  const parsedQuery = parseCatalogSearchQuery(input.query);
  const nameQuery =
    parsedQuery.keyword ??
    (parsedQuery.setCode && parsedQuery.cardNumber
      ? `${parsedQuery.setCode}-${parsedQuery.cardNumber}`
      : parsedQuery.setCode ?? parsedQuery.cardNumber ?? undefined);

  try {
    const supabase = createPublicClient();

    const gradeFilters =
      input.gradeFilters && input.gradeFilters.length > 0
        ? input.gradeFilters
        : undefined;

    const rpcArgs = {
      p_seller_id: input.sellerId,
      p_name_query: nameQuery,
      p_rarities:
        input.rarities && input.rarities.length > 0 ? input.rarities : undefined,
      p_grade_filters: gradeFilters,
      p_price_min: input.priceMin ?? undefined,
      p_price_max: input.priceMax ?? undefined,
      p_sort: mapSortKey(input.sortKey),
      p_page: page,
      p_page_size: pageSize,
    };

    const rpcStartedAt = isMarketplacePerfLogEnabled()
      ? marketplacePerfNow()
      : 0;

    const { data, error } = await (
      supabase as unknown as {
        rpc: (
          fn: "search_marketplace_seller_listings",
          args: typeof rpcArgs,
        ) => Promise<{
          data: SellerListingRpcRow[] | null;
          error: { message: string } | null;
        }>;
      }
    ).rpc("search_marketplace_seller_listings", rpcArgs);

    if (isMarketplacePerfLogEnabled()) {
      marketplacePerfLog(
        `searchMarketplaceSellerListings seller=${input.sellerId} page=${page}=${Math.round(marketplacePerfNow() - rpcStartedAt)}ms`,
      );
    }

    if (error) {
      console.error("[searchMarketplaceSellerListings]", error.message);
      return { success: false, error: "搜尋商戶櫥窗時發生錯誤" };
    }

    const allRows = (data ?? []) as SellerListingRpcRow[];
    const rows = input.sellerPersona
      ? allRows.filter((row) => row.seller_persona === input.sellerPersona)
      : allRows;
    const listings = await enrichSellerListingRowsWithShipping(
      supabase,
      rows.map(mapSellerListingRpcRow),
    );

    const metaRow = rows[0] ?? allRows[0];

    return {
      success: true,
      data: {
        listings,
        meta: toPaginationMeta(metaRow, page, pageSize),
        priceBounds: readSellerPriceBounds(metaRow),
      },
    };
  } catch (error) {
    console.error("[searchMarketplaceSellerListings]", error);
    return { success: false, error: "無法連線至商戶櫥窗" };
  }
}

export async function getMarketplaceSellerListingDetail(
  sellerKey: string,
  listingKey: string,
): Promise<MarketplaceSellerListingDetailResult> {
  if (!isSupabaseConfigured()) {
    return { success: false, error: "無法連線至商戶櫥窗" };
  }

  const trimmedSeller = sellerKey.trim();
  const trimmedListing = listingKey.trim();
  if (!trimmedSeller || !trimmedListing) {
    return { success: false, error: "未找到該私域現貨標的" };
  }

  try {
    const productId = await resolveSellerListingCatalogKey(
      trimmedSeller,
      trimmedListing,
    );
    if (!productId) {
      return { success: false, error: "未找到該私域現貨標的" };
    }

    const catalogResult = await getMarketplaceProductDetail(productId);
    if (!catalogResult.success) {
      return { success: false, error: "未找到該私域現貨標的" };
    }

    const detail = await loadMarketplaceSellerListingDetail(
      trimmedSeller,
      trimmedListing,
      catalogResult.data,
    );

    if (!detail) {
      return { success: false, error: "未找到該私域現貨標的" };
    }

    return {
      success: true,
      data: {
        seller: detail.seller,
        catalog: catalogResult.data,
        storefrontListing: detail.storefrontListing,
        photos: detail.photos,
        photosDetail: parseListingImageObjects(detail.listingRow.images),
        batchLabel: detail.batchLabel,
        price: Number(detail.listingRow.price),
        gradingCompany: detail.listingRow.grading_company,
        gradingScore: detail.listingRow.grading_score,
        useAuthentication: detail.listingRow.use_authentication,
      },
    };
  } catch (error) {
    console.error("[getMarketplaceSellerListingDetail]", error);
    return { success: false, error: "無法載入私域現貨標的" };
  }
}
