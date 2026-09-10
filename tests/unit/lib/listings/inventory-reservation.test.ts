import { describe, expect, it } from "vitest";
import type { InventoryListingRow } from "@/lib/listings/build-inventory-groups";
import {
  isListingReservedForOpenOrder,
  matchesInventoryStatusFilter,
} from "@/lib/listings/inventory-reservation";

function listing(
  overrides: Partial<InventoryListingRow> & Pick<InventoryListingRow, "id" | "status">,
): InventoryListingRow {
  return {
    product_id: "product-1",
    price: 100,
    grading_company: "OTHER",
    grading_score: "SEALED",
    images: [],
    seller_description: null,
    created_at: "2026-01-01T00:00:00.000Z",
    use_authentication: false,
    extra_shipping_fee: 0,
    ...overrides,
  };
}

describe("inventory reservation", () => {
  it("treats inactive listings with open orders as active-tab items", () => {
    const reservedIds = new Set(["listing-1"]);
    const row = listing({ id: "listing-1", status: "inactive" });

    expect(isListingReservedForOpenOrder(row, reservedIds)).toBe(true);
    expect(matchesInventoryStatusFilter(row, "active", reservedIds)).toBe(true);
    expect(matchesInventoryStatusFilter(row, "inactive", reservedIds)).toBe(false);
  });

  it("keeps voluntary inactive listings in inactive tab", () => {
    const row = listing({ id: "listing-2", status: "inactive" });

    expect(matchesInventoryStatusFilter(row, "inactive", new Set())).toBe(true);
    expect(matchesInventoryStatusFilter(row, "active", new Set())).toBe(false);
  });
});
