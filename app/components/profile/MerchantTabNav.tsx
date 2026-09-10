"use client";

import { usePathname } from "next/navigation";
import { ProfileTabNav } from "@/app/components/profile/ProfileTabNav";
import type { TabItem } from "@/app/components/profile/ProfileTabNav";

const MERCHANT_HUB_PATHS = new Set([
  "/profile/merchant",
  "/profile/merchant/inventory",
  "/profile/merchant/trading",
  "/profile/merchant/finance",
]);

const MERCHANT_TABS: TabItem[] = [
  { href: "/profile/merchant", label: "總覽", iconKey: "merchant-overview" },
  { href: "/profile/merchant/inventory", label: "我的掛單", iconKey: "my-listings" },
  { href: "/profile/merchant/trading", label: "交易管理", iconKey: "trading" },
  { href: "/profile/merchant/finance", label: "資金金流", iconKey: "finance" },
];

export function MerchantTabNav() {
  const pathname = usePathname();

  if (!MERCHANT_HUB_PATHS.has(pathname)) {
    return null;
  }

  return <ProfileTabNav tabs={MERCHANT_TABS} />;
}
