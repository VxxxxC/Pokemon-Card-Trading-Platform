"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ClipboardList,
  Layers,
  LayoutDashboard,
  Store,
  Tag,
  UserCircle,
  Wallet,
  type LucideIcon,
} from "lucide-react";

export type TabIconKey =
  | "overview"
  | "collection"
  | "inventory"
  | "my-listings"
  | "trading"
  | "finance"
  | "merchant-overview"
  | "merchant-inventory";

const TAB_ICON_MAP: Record<TabIconKey, LucideIcon> = {
  overview: UserCircle,
  collection: Layers,
  inventory: Store,
  "my-listings": Tag,
  trading: ClipboardList,
  finance: Wallet,
  "merchant-overview": LayoutDashboard,
  "merchant-inventory": LayoutDashboard,
};

export interface TabItem {
  href: string;
  label: string;
  icon?: string;
  iconKey?: TabIconKey;
}

interface ProfileTabNavProps {
  tabs: TabItem[];
}

export function ProfileTabNav({ tabs }: ProfileTabNavProps) {
  const pathname = usePathname();

  return (
    <nav
      className="sticky top-12 z-40 flex w-full gap-0 overflow-x-auto overflow-y-hidden scrollbar-none border-b border-[rgba(237,232,224,0.08)] mb-4 bg-[#17130f]/95 backdrop-blur-sm lg:top-14"
      aria-label="個人頁面導航"
    >
      {tabs.map(({ href, label, icon, iconKey }) => {
        const isActive = pathname === href;
        const LucideTabIcon =
          iconKey != null ? TAB_ICON_MAP[iconKey] : null;
        return (
          <Link
            key={href}
            href={href}
            prefetch
            className={`flex items-center gap-1.5 shrink-0 px-3 py-2 font-mono text-[11px] sm:text-[12px] font-medium border-b-2 -mb-px transition-colors ${
              isActive
                ? "text-brand border-brand"
                : "text-text-secondary border-transparent hover:text-text-primary"
            }`}
          >
            {LucideTabIcon ? (
              <LucideTabIcon className="h-3.5 w-3.5 shrink-0" aria-hidden />
            ) : icon ? (
              <span aria-hidden="true">{icon}</span>
            ) : null}
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
