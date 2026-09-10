import type {
  InventoryGroupsPage,
  InventoryStatusFilter,
  InventorySummary,
} from "@/app/lib/inventory/types";
import {
  filterInventoryListingsForDisplay,
  matchesInventorySearch,
  groupListingsByProduct,
  summarizeInventoryListings,
  type InventoryListingRow,
  type InventoryStatsRow,
} from "@/lib/listings/build-inventory-groups";
import {
  fetchReservedListingIds,
} from "@/lib/listings/inventory-reservation";
import {
  inventoryPerfLog,
  inventoryPerfNow,
  isInventoryPerfLogEnabled,
} from "@/lib/listings/perf-log";
import {
  type CatalogRow,
} from "@/lib/marketplace/portfolio-pricing";
import { createClient } from "@/lib/supabase/server";

export type UserInventoryViewInput = {
  page: number;
  pageSize: number;
  query: string;
  sellerPersona?: "member" | "merchant";
  statusFilter?: InventoryStatusFilter;
};

export type UserInventoryView = {
  summary: InventorySummary;
  page: InventoryGroupsPage;
};

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

const CATALOG_LIST_COLUMNS =
  "id, name_zh, name_en, name_ja, card_number, display_id, set_code, image_url, rarity";

const EMPTY_SUMMARY: InventorySummary = {
  totalListings: 0,
  activeCount: 0,
  soldCount: 0,
  inactiveCount: 0,
};

const EMPTY_PAGE = (pageSize: number): InventoryGroupsPage => ({
  groups: [],
  totalGroups: 0,
  page: 1,
  pageSize,
  totalPages: 0,
});

export async function fetchSellerListings(
  supabase: SupabaseServerClient,
  userId: string,
  sellerPersona?: "member" | "merchant",
): Promise<InventoryListingRow[]> {
  let query = supabase
    .from("listings")
    .select(
      "id, product_id, price, grading_company, grading_score, images, status, seller_description, created_at, use_authentication, extra_shipping_fee",
    )
    .eq("seller_id", userId);

  if (sellerPersona) {
    query = query.eq("seller_persona", sellerPersona);
  }

  const { data, error } = await query.order("created_at", { ascending: false });

  if (error) {
    console.error("[fetchSellerListings]", error.message);
    throw new Error("無法載入上架商品");
  }

  return (data ?? []) as InventoryListingRow[];
}

async function loadInventoryContext(
  supabase: SupabaseServerClient,
  listingRows: InventoryListingRow[],
): Promise<{
  catalogById: Map<string, CatalogRow>;
  statsByListingId: Map<string, InventoryStatsRow>;
}> {
  const productIds = [...new Set(listingRows.map((row) => row.product_id))];
  const listingIds = listingRows.map((row) => row.id);

  if (productIds.length === 0) {
    return {
      catalogById: new Map(),
      statsByListingId: new Map(),
    };
  }

  const [catalogResult, statsResult] = await Promise.all([
    supabase.from("product_catalog").select(CATALOG_LIST_COLUMNS).in("id", productIds),
    listingIds.length > 0
      ? supabase
          .from("listing_stats")
          .select("listing_id, views, offers_count")
          .in("listing_id", listingIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (catalogResult.error) {
    throw new Error("無法載入卡牌資料");
  }
  if (statsResult.error) {
    throw new Error("無法載入掛單統計");
  }

  const catalogById = new Map<string, CatalogRow>();
  for (const row of (catalogResult.data ?? []) as CatalogRow[]) {
    catalogById.set(row.id, row);
  }

  const statsByListingId = new Map<string, InventoryStatsRow>();
  for (const row of (statsResult.data ?? []) as InventoryStatsRow[]) {
    statsByListingId.set(row.listing_id, row);
  }

  return { catalogById, statsByListingId };
}

function buildInventoryGroupsPage(
  listings: InventoryListingRow[],
  catalogById: Map<string, CatalogRow>,
  statsByListingId: Map<string, InventoryStatsRow>,
  input: UserInventoryViewInput,
  reservedListingIds: ReadonlySet<string>,
): InventoryGroupsPage {
  let groups = groupListingsByProduct({
    listings,
    catalogById,
    statsByListingId,
    reservedListingIds,
  });

  if (input.query) {
    groups = groups.filter((group) => {
      const catalog = catalogById.get(group.id);
      return matchesInventorySearch(catalog, input.query);
    });
  }

  const totalGroups = groups.length;
  const totalPages = totalGroups === 0 ? 0 : Math.ceil(totalGroups / input.pageSize);
  const safePage =
    totalPages === 0 ? 1 : Math.min(input.page, Math.max(totalPages, 1));
  const start = (safePage - 1) * input.pageSize;
  const paginatedGroups = groups.slice(start, start + input.pageSize);

  return {
    groups: paginatedGroups,
    totalGroups,
    page: safePage,
    pageSize: input.pageSize,
    totalPages,
  };
}

export async function loadUserInventoryView(
  supabase: SupabaseServerClient,
  userId: string,
  input: UserInventoryViewInput,
  perfLabel = "view",
): Promise<UserInventoryView> {
  const rowsStart = isInventoryPerfLogEnabled() ? inventoryPerfNow() : 0;
  const listings = await fetchSellerListings(
    supabase,
    userId,
    input.sellerPersona,
  );

  if (isInventoryPerfLogEnabled()) {
    inventoryPerfLog(
      `${perfLabel}.rowsMs=${Math.round(inventoryPerfNow() - rowsStart)} listings=${listings.length}`,
    );
  }

  if (listings.length === 0) {
    return {
      summary: EMPTY_SUMMARY,
      page: EMPTY_PAGE(input.pageSize),
    };
  }

  const contextStart = isInventoryPerfLogEnabled() ? inventoryPerfNow() : 0;
  const listingIds = listings.map((listing) => listing.id);
  const [context, reservedListingIds] = await Promise.all([
    loadInventoryContext(supabase, listings),
    fetchReservedListingIds(supabase, userId, listingIds),
  ]);
  const { catalogById, statsByListingId } = context;

  if (isInventoryPerfLogEnabled()) {
    inventoryPerfLog(
      `${perfLabel}.contextMs=${Math.round(inventoryPerfNow() - contextStart)} products=${catalogById.size}`,
    );
  }

  const filteredListings = filterInventoryListingsForDisplay(
    listings,
    input.statusFilter ?? "active",
    reservedListingIds,
  );

  return {
    summary: summarizeInventoryListings(listings, reservedListingIds),
    page: buildInventoryGroupsPage(
      filteredListings,
      catalogById,
      statsByListingId,
      input,
      reservedListingIds,
    ),
  };
}
