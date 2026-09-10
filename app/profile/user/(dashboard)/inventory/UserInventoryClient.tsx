"use client";

import type { InventoryInitialData } from "@/app/lib/hooks/useInventory";
import { ProfileInventoryClient } from "@/app/components/inventory/ProfileInventoryClient";

type UserInventoryClientProps = {
  initialData: InventoryInitialData;
  bootstrapError?: string;
};

export function UserInventoryClient({
  initialData,
  bootstrapError,
}: UserInventoryClientProps) {
  return (
    <ProfileInventoryClient
      initialData={initialData}
      bootstrapError={bootstrapError}
      sellerPersona="member"
      inventoryContext="member"
      searchInputId="user-sku-search"
    />
  );
}
