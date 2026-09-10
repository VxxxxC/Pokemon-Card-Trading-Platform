"use client";

import dynamic from "next/dynamic";
import { useEffect, type ReactNode } from "react";
import { TopNav } from "@/app/components/navigation/TopNav";
import { MobileHeader } from "@/app/components/navigation/MobileHeader";
import { BottomNav } from "@/app/components/navigation/BottomNav";
import { Footer } from "@/app/components/navigation/Footer";
import { PriceTicker } from "@/app/components/ticker/PriceTicker";
import type { HomePriceTickerItem } from "@/lib/home/load-home-ticker";
import { HeroSearch } from "@/app/components/home/HeroSearch";
import { HomeBanner } from "@/app/components/home/HomeBanner";
import { TrustBanner } from "@/app/components/home/TrustBanner";
import { AnnouncementModal } from "@/app/components/announcements/AnnouncementModal";
import { markHomeClientMount } from "@/app/lib/home/perf-log-client";
import type { HomeBannerItem } from "@/app/lib/home/types";
import type { PlatformAnnouncement } from "@/lib/announcements/types";

const PwaInstallPrompt = dynamic(
  () =>
    import("@/app/components/pwa/PwaInstallPrompt").then(
      (mod) => mod.PwaInstallPrompt,
    ),
  { ssr: false },
);

export type HomePageShellProps = {
  currentUserId: string | null;
  activeAnnouncements: PlatformAnnouncement[];
  homeBanners?: HomeBannerItem[];
  tickerItems?: HomePriceTickerItem[];
  children: ReactNode;
};

export function HomePageShell({
  currentUserId,
  activeAnnouncements,
  homeBanners = [],
  tickerItems = [],
  children,
}: HomePageShellProps) {
  const showCheckIn = currentUserId != null;

  useEffect(() => {
    markHomeClientMount();
  }, []);

  return (
    <div className="min-h-[100dvh] bg-bg-page text-text-primary flex flex-col font-sans">
      <TopNav />
      <MobileHeader />
      <PriceTicker data={tickerItems} />
      <PwaInstallPrompt />
      <AnnouncementModal announcements={activeAnnouncements} />

      <main className="flex-1 max-w-[1100px] mx-auto w-full px-4 lg:px-8 pb-28 lg:pb-8 space-y-6">
        <HomeBanner banners={homeBanners} />
        <HeroSearch showCheckIn={showCheckIn} />
        <TrustBanner />
        <div className="pt-4 sm:pt-5 space-y-7 sm:space-y-8">{children}</div>
      </main>

      <Footer />
      <BottomNav />
    </div>
  );
}
