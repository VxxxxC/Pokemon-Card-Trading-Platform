import type { HomeListingCard } from "@/app/lib/home/types";
import { CERTIFIED_MERCHANT_BADGE_LABEL } from "@/app/components/profile/CertifiedMerchantBadge";
import { HOME_LISTING_LIMIT } from "@/lib/home/constants";
import {
  parseListingImageUrls,
  resolveListingCoverImageUrl,
} from "@/lib/listings/images";
import { formatTradeGradeLabel } from "@/lib/marketplace/listing-display";
import {
  resolveCardCode,
  resolveProductName,
  type CatalogRow,
} from "@/lib/marketplace/portfolio-pricing";
import { createPublicClient } from "@/lib/supabase/public";
import {
  homePerfLog,
  homePerfNow,
  isHomePerfLogEnabled,
} from "@/lib/home/perf-log";
import type { Tables } from "@/types/supabase";

type ListingRow = Pick<
  Tables<"listings">,
  | "id"
  | "product_id"
  | "price"
  | "grading_company"
  | "grading_score"
  | "seller_id"
  | "images"
  | "created_at"
  | "use_authentication"
  | "seller_persona"
  | "status"
>;

type ProfileRow = Pick<
  Tables<"public_profiles">,
  "id" | "display_name" | "is_merchant"
>;

type MerchantShopRow = Pick<
  Tables<"merchant_shops">,
  "merchant_id" | "shop_name" | "shop_handle"
>;

const CATALOG_COLUMNS =
  "id, name_zh, name_en, name_ja, card_number, display_id, set_code, image_url, rarity";

function resolveHomeSellerName(
  profile: ProfileRow | undefined,
  shop: MerchantShopRow | null | undefined,
  persona: Tables<"listings">["seller_persona"],
): string {
  if (persona === "merchant") {
    return (
      shop?.shop_name?.trim() ||
      shop?.shop_handle?.trim() ||
      "認證商戶"
    );
  }
  return profile?.display_name?.trim() || "賣家";
}

function mapListingToCard(
  listing: ListingRow,
  catalog: CatalogRow | undefined,
  profile: ProfileRow | undefined,
  shop: MerchantShopRow | null | undefined,
  persona: Tables<"listings">["seller_persona"],
): HomeListingCard {
  const imageUrls = parseListingImageUrls(listing.images);
  const catalogImageUrl = catalog?.image_url?.trim() ?? null;
  const imageUrl =
    resolveListingCoverImageUrl(listing.images, catalogImageUrl) ?? "";
  const sellerName = resolveHomeSellerName(profile, shop, persona);

  return {
    listingId: listing.id,
    productId: listing.product_id,
    displayId: catalog?.display_id ?? null,
    cardCode: resolveCardCode(catalog),
    name: resolveProductName(catalog),
    setCode: catalog?.set_code ?? "",
    rarity: catalog?.rarity ?? null,
    gradingCompany: listing.grading_company,
    gradingScore: listing.grading_score,
    gradeLabel: formatTradeGradeLabel(
      listing.grading_company,
      listing.grading_score,
    ),
    price: Number(listing.price),
    imageUrl,
    catalogImageUrl,
    sellerId: listing.seller_id,
    sellerName,
    sellerBadge:
      profile?.is_merchant ? CERTIFIED_MERCHANT_BADGE_LABEL : "C2C 賣家",
    photoCount: imageUrls.length,
    createdAt: listing.created_at,
    useAuthentication: listing.use_authentication,
  };
}

export async function fetchHomeListingsByPersona(
  persona: Tables<"listings">["seller_persona"],
  limit = HOME_LISTING_LIMIT,
): Promise<HomeListingCard[]> {
  const supabase = createPublicClient();
  const startedAt = isHomePerfLogEnabled() ? homePerfNow() : 0;

  const { data: listingRows, error: listingError } = await supabase
    .from("listings")
    .select(
      "id, product_id, price, grading_company, grading_score, seller_id, images, created_at, use_authentication, seller_persona, status",
    )
    .eq("status", "active")
    .eq("seller_persona", persona)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (listingError) {
    console.error("[fetchHomeListingsByPersona]", listingError.message);
    throw new Error("無法載入首頁掛單");
  }

  const listings = ((listingRows ?? []) as ListingRow[]).filter(
    (row) => row.status === "active",
  );
  if (listings.length === 0) {
    if (isHomePerfLogEnabled()) {
      homePerfLog(
        `listings.${persona}=${Math.round(homePerfNow() - startedAt)}ms count=0`,
      );
    }
    return [];
  }

  const productIds = [...new Set(listings.map((row) => row.product_id))];
  const sellerIds = [...new Set(listings.map((row) => row.seller_id))];

  const [catalogResult, profileResult, shopResult] = await Promise.all([
    supabase.from("product_catalog").select(CATALOG_COLUMNS).in("id", productIds),
    supabase
      .from("public_profiles")
      .select("id, display_name, is_merchant")
      .in("id", sellerIds),
    persona === "merchant"
      ? supabase
          .from("merchant_shops")
          .select("merchant_id, shop_name, shop_handle")
          .in("merchant_id", sellerIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (catalogResult.error) {
    console.error("[fetchHomeListingsByPersona]", catalogResult.error.message);
    throw new Error("無法載入卡牌資料");
  }

  if (profileResult.error) {
    console.error("[fetchHomeListingsByPersona]", profileResult.error.message);
    throw new Error("無法載入賣家資料");
  }

  if (shopResult.error) {
    console.error("[fetchHomeListingsByPersona]", shopResult.error.message);
    throw new Error("無法載入商戶資料");
  }

  const catalogById = new Map(
    ((catalogResult.data ?? []) as CatalogRow[]).map((row) => [row.id, row]),
  );
  const profileById = new Map(
    ((profileResult.data ?? []) as ProfileRow[]).map((row) => [row.id, row]),
  );
  const shopByMerchantId = new Map(
    ((shopResult.data ?? []) as MerchantShopRow[]).map((row) => [
      row.merchant_id,
      row,
    ]),
  );

  const cards = listings.map((listing) =>
    mapListingToCard(
      listing,
      catalogById.get(listing.product_id),
      profileById.get(listing.seller_id),
      shopByMerchantId.get(listing.seller_id) ?? null,
      persona,
    ),
  );

  if (isHomePerfLogEnabled()) {
    homePerfLog(
      `listings.${persona}=${Math.round(homePerfNow() - startedAt)}ms count=${cards.length}`,
    );
  }

  return cards;
}
