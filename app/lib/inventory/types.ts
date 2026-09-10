import type { ListingStatus } from "@/app/lib/types/rbac";
import type { SKUGroup } from "@/app/components/merchant/InventoryAccordion";

export type InventoryListingItem = SKUGroup["items"][number];

export type InventoryProductGroup = SKUGroup & {
  imageUrl?: string | null;
};

export type InventorySummary = {
  totalListings: number;
  activeCount: number;
  soldCount: number;
  inactiveCount: number;
};

export type InventorySellerPersona = "member" | "merchant";

export type InventoryStatusFilter = InventoryDbListingStatus;

export const DEFAULT_INVENTORY_STATUS_FILTER: InventoryStatusFilter = "active";

export type GetUserInventoryGroupsInput = {
  query?: string;
  page?: number;
  pageSize?: number;
  sellerPersona?: InventorySellerPersona;
  statusFilter?: InventoryStatusFilter;
};

export type InventoryGroupsPage = {
  groups: InventoryProductGroup[];
  totalGroups: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

export type InventoryPageBootstrap = {
  summary: InventorySummary;
  page: InventoryGroupsPage;
};

export type InventoryDbListingStatus = "active" | "sold" | "inactive";

export function mapListingStatusToUi(
  status: InventoryDbListingStatus,
): ListingStatus {
  switch (status) {
    case "active":
      return "active";
    case "sold":
      return "sold";
    case "inactive":
      return "inactive";
    default:
      return "inactive";
  }
}
