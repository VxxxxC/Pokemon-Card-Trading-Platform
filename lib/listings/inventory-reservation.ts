import type { InventoryListingRow } from "@/lib/listings/build-inventory-groups";
import type { InventoryStatusFilter } from "@/app/lib/inventory/types";
import type { createClient } from "@/lib/supabase/server";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export function isListingReservedForOpenOrder(
  listing: Pick<InventoryListingRow, "id" | "status">,
  reservedListingIds: ReadonlySet<string>,
): boolean {
  return listing.status === "inactive" && reservedListingIds.has(listing.id);
}

export function matchesInventoryStatusFilter(
  listing: InventoryListingRow,
  filter: InventoryStatusFilter,
  reservedListingIds: ReadonlySet<string>,
): boolean {
  const isReserved = isListingReservedForOpenOrder(listing, reservedListingIds);

  switch (filter) {
    case "active":
      return listing.status === "active" || isReserved;
    case "inactive":
      return listing.status === "inactive" && !isReserved;
    case "sold":
      return listing.status === "sold";
    default:
      return false;
  }
}

export async function fetchReservedListingIds(
  supabase: SupabaseServerClient,
  userId: string,
  listingIds: string[],
): Promise<Set<string>> {
  if (listingIds.length === 0) {
    return new Set();
  }

  const [merchantResult, memberResult] = await Promise.all([
    supabase
      .from("merchant_orders")
      .select("listing_id")
      .eq("merchant_id", userId)
      .eq("escrow_status", "pending_payment")
      .in("listing_id", listingIds)
      .returns<{ listing_id: string }[]>(),
    supabase
      .from("member_orders")
      .select("listing_id")
      .eq("seller_id", userId)
      .in("listing_id", listingIds)
      .or("status.eq.pending,escrow_status.eq.payment")
      .returns<{ listing_id: string }[]>(),
  ]);

  if (merchantResult.error) {
    console.error("[fetchReservedListingIds] merchant", merchantResult.error.message);
    throw new Error("無法載入訂單狀態");
  }

  if (memberResult.error) {
    console.error("[fetchReservedListingIds] member", memberResult.error.message);
    throw new Error("無法載入訂單狀態");
  }

  const reserved = new Set<string>();
  for (const row of merchantResult.data ?? []) {
    if (row.listing_id) {
      reserved.add(row.listing_id);
    }
  }
  for (const row of memberResult.data ?? []) {
    if (row.listing_id) {
      reserved.add(row.listing_id);
    }
  }

  return reserved;
}
