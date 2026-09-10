import type { ReactNode } from "react";
import type { Metadata } from "next";
import { TopNav } from "@/app/components/navigation/TopNav";
import { MobileHeader } from "@/app/components/navigation/MobileHeader";
import { BottomNav } from "@/app/components/navigation/BottomNav";
import type { TabItem } from "@/app/components/profile/ProfileTabNav";
import { UserProfileTabNav } from "@/app/components/profile/UserProfileTabNav";
import { UserProfileDashboardShell } from "@/app/components/rewards/UserProfileDashboardShell";

export const metadata: Metadata = {
  title: "我的帳號 · 總覽 — HKCardVault",
  description: "查看個人收藏估值、身份等級及交易紀錄",
};

const USER_TABS: TabItem[] = [
  { href: "/profile/user", label: "總覽", iconKey: "overview" },
  { href: "/profile/user/collection", label: "卡牌庫", iconKey: "collection" },
  { href: "/profile/user/inventory", label: "我的掛單", iconKey: "my-listings" },
  { href: "/profile/user/trading", label: "交易管理", iconKey: "trading" },
];

export default function UserProfileLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <div className="min-h-dvh bg-bg-page flex flex-col">
      <TopNav />
      <MobileHeader />

      <main className="mt-3 flex-1 max-w-[1100px] mx-auto w-full px-4 lg:px-8 pb-28 lg:pb-10">
        <UserProfileTabNav tabs={USER_TABS} />
        <UserProfileDashboardShell>{children}</UserProfileDashboardShell>
      </main>

      <BottomNav />
    </div>
  );
}
