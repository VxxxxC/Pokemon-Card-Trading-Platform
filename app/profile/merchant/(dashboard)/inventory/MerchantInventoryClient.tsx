"use client";

import type { InventoryInitialData } from "@/app/lib/hooks/useInventory";
import { ProfileInventoryClient } from "@/app/components/inventory/ProfileInventoryClient";

type MerchantInventoryClientProps = {
  initialData: InventoryInitialData;
  bootstrapError?: string;
};

export function MerchantInventoryClient({
  initialData,
  bootstrapError,
}: MerchantInventoryClientProps) {
  return (
    <ProfileInventoryClient
      initialData={initialData}
      bootstrapError={bootstrapError}
      sellerPersona="merchant"
      inventoryContext="merchant"
      searchInputId="merchant-sku-search"
      showProductAnalytics
    />
  );
}
