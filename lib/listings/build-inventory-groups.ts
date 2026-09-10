import type { InventoryProductGroup } from "@/app/lib/inventory/types";
import { mapListingStatusToUi } from "@/app/lib/inventory/types";
import { formatTradeGradeLabel } from "@/lib/marketplace/listing-display";
import { isSealedProductGrade } from "@/lib/catalog/item-kind";
import { isListingReservedForOpenOrder, matchesInventoryStatusFilter } from "@/lib/listings/inventory-reservation";
import {
  resolveCardCode,
  resolveProductName,
  type CatalogRow,
} from "@/lib/marketplace/portfolio-pricing";
import {
  parseListingImageObjects,
  parseListingImageUrls,
} from "@/lib/listings/images";
import { resolveGradingOptionId } from "@/lib/grading/resolve-option-id";
import { matchesCatalogCardSearch } from "@/lib/search/card-identifier";
import type { Tables } from "@/types/supabase";

export type InventoryListingRow = Pick<
  Tables<"listings">,
  | "id"
  | "product_id"
  | "price"
  | "grading_company"
  | "grading_score"
  | "images"
  | "status"
  | "seller_description"
  | "created_at"
  | "use_authentication"
  | "extra_shipping_fee"
>;

export type InventoryStatsRow = Pick<
  Tables<"listing_stats">,
  "listing_id" | "views" | "offers_count"
>;

function formatInventoryCreatedAt(createdAt: string): string {
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  return `${year}/${month}/${day}`;
}

export function matchesInventorySearch(
  catalog: CatalogRow | undefined,
  query: string,
): boolean {
  if (!query.trim()) return true;
  return matchesCatalogCardSearch(query, catalog ?? {});
}

export function filterInventoryListingsForDisplay(
  listings: InventoryListingRow[],
  status: InventoryListingRow["status"] = "active",
  reservedListingIds: ReadonlySet<string> = new Set(),
): InventoryListingRow[] {
  return listings.filter((listing) =>
    matchesInventoryStatusFilter(
      listing,
      status,
      reservedListingIds,
    ),
  );
}

export function groupListingsByProduct(input: {
  listings: InventoryListingRow[];
  catalogById: Map<string, CatalogRow>;
  statsByListingId: Map<string, InventoryStatsRow>;
  reservedListingIds?: ReadonlySet<string>;
}): InventoryProductGroup[] {
  const grouped = new Map<string, InventoryListingRow[]>();

  const reservedListingIds = input.reservedListingIds ?? new Set<string>();

  for (const listing of input.listings) {
    const bucket = grouped.get(listing.product_id);
    if (bucket) {
      bucket.push(listing);
    } else {
      grouped.set(listing.product_id, [listing]);
    }
  }

  const groups: InventoryProductGroup[] = [];

  for (const [productId, productListings] of grouped) {
    const catalog = input.catalogById.get(productId);
    const sortedListings = [...productListings].sort(
      (left, right) =>
        new Date(right.created_at).getTime() - new Date(left.created_at).getTime(),
    );

    groups.push({
      id: productId,
      cardName:
        catalog?.name_ja?.trim() ||
        catalog?.name_en?.trim() ||
        catalog?.name_zh?.trim() ||
        resolveProductName(catalog),
      cardNo: resolveCardCode(catalog),
      nameZh: catalog?.name_zh?.trim() || null,
      setCode: catalog?.set_code?.trim() || "",
      cardNumber:
        catalog?.card_number?.trim() ||
        catalog?.display_id?.trim() ||
        "",
      rarity: catalog?.rarity?.trim() || null,
      thumbnailSeed: productId,
      imageUrl: catalog?.image_url ?? null,
      items: sortedListings.map((listing) => {
        const stats = input.statsByListingId.get(listing.id);
        const gradeLabel = formatTradeGradeLabel(
          listing.grading_company,
          listing.grading_score,
        );

        const images = parseListingImageObjects(listing.images);

        return {
          id: listing.id,
          grade: gradeLabel,
          grader: listing.grading_company,
          askPrice: Number(listing.price),
          status: mapListingStatusToUi(listing.status),
          createdAt: formatInventoryCreatedAt(listing.created_at),
          conditionDesc: listing.seller_description?.trim() ?? "",
          edgeWear: "",
          photos: parseListingImageUrls(listing.images).length,
          images,
          gradingOptionId: resolveGradingOptionId(
            listing.grading_company,
            listing.grading_score,
          ),
          useAuthentication: listing.use_authentication,
          views: stats?.views ?? 0,
          offersCount: stats?.offers_count ?? 0,
          isSealedListing: isSealedProductGrade(
            listing.grading_company,
            listing.grading_score,
          ),
          isOrderReserved: isListingReservedForOpenOrder(
            listing,
            reservedListingIds,
          ),
          extraShippingFee: Number(listing.extra_shipping_fee ?? 0),
        };
      }),
    });
  }

  groups.sort((left, right) => left.cardName.localeCompare(right.cardName, "zh-Hant"));

  return groups;
}

export function summarizeInventoryListings(
  listings: InventoryListingRow[],
  reservedListingIds: ReadonlySet<string> = new Set(),
): {
  totalListings: number;
  activeCount: number;
  soldCount: number;
  inactiveCount: number;
} {
  let activeCount = 0;
  let soldCount = 0;
  let inactiveCount = 0;

  for (const listing of listings) {
    if (listing.status === "active") activeCount += 1;
    else if (listing.status === "sold") soldCount += 1;
    else if (listing.status === "inactive") {
      if (isListingReservedForOpenOrder(listing, reservedListingIds)) {
        activeCount += 1;
      } else {
        inactiveCount += 1;
      }
    }
  }

  return {
    totalListings: activeCount + inactiveCount,
    activeCount,
    soldCount,
    inactiveCount,
  };
}
