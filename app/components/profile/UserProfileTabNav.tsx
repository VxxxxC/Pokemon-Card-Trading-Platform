"use client";

import { ProfileTabNav } from "@/app/components/profile/ProfileTabNav";
import type { TabItem } from "@/app/components/profile/ProfileTabNav";
import { useIsMemberPersonaActive } from "@/app/lib/hooks/useIsMemberPersonaActive";
import { usePathname } from "next/navigation";

const COLLECTION_INVENTORY_PATHS = new Set([
  "/profile/user/collection",
  "/profile/user/inventory",
]);

type UserProfileTabNavProps = {
  tabs: TabItem[];
};

export function UserProfileTabNav({ tabs }: UserProfileTabNavProps) {
  const pathname = usePathname();
  const isMemberPersonaActive = useIsMemberPersonaActive();
  const showCollectionTab =
    isMemberPersonaActive || COLLECTION_INVENTORY_PATHS.has(pathname);

  const visibleTabs = showCollectionTab
    ? tabs
    : tabs.filter((tab) => tab.href !== "/profile/user/collection");

  return <ProfileTabNav tabs={visibleTabs} />;
}
