import { Suspense } from "react";
import { HomePageShell } from "@/app/HomePageShell";
import {
  getActiveAnnouncementsForDisplay,
  getHomeBannersForDisplay,
} from "@/app/actions/admin-announcements";
import { getWishlistFavoredKeysForUser } from "@/app/actions/wishlist";
import { HomeC2cSectionData } from "@/app/home/HomeC2cSectionData";
import { HomeMerchantSectionData } from "@/app/home/HomeMerchantSectionData";
import { HomeWishlistSectionData } from "@/app/home/HomeWishlistSectionData";
import {
  C2cSectionSkeleton,
  MerchantSectionSkeleton,
  WishlistSectionSkeleton,
} from "@/app/home/HomeSectionSkeletons";
import { getOptionalAuthUser } from "@/lib/auth/session";
import { loadHomePriceTickerItems } from "@/lib/home/load-home-ticker";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export default async function HomePage() {
  const user = isSupabaseConfigured() ? await getOptionalAuthUser() : null;
  const currentUserId = user?.id ?? null;
  const favoredKeys =
    user != null ? await getWishlistFavoredKeysForUser(user.id) : [];
  const activeAnnouncementsResult = isSupabaseConfigured()
    ? await getActiveAnnouncementsForDisplay()
    : { success: true as const, data: [] };
  const activeAnnouncements = activeAnnouncementsResult.success
    ? activeAnnouncementsResult.data
    : [];
  const homeBannersResult = isSupabaseConfigured()
    ? await getHomeBannersForDisplay()
    : { success: true as const, data: [] };
  const homeBanners = homeBannersResult.success ? homeBannersResult.data : [];
  const tickerItems = await loadHomePriceTickerItems();

  return (
    <HomePageShell
      currentUserId={currentUserId}
      activeAnnouncements={activeAnnouncements}
      homeBanners={homeBanners}
      tickerItems={tickerItems}
    >
      {user ? (
        <Suspense fallback={<WishlistSectionSkeleton />}>
          <HomeWishlistSectionData userId={user.id} />
        </Suspense>
      ) : null}

      <Suspense fallback={<MerchantSectionSkeleton />}>
        <HomeMerchantSectionData
          currentUserId={currentUserId}
          favoredKeys={favoredKeys}
        />
      </Suspense>

      <Suspense fallback={<C2cSectionSkeleton />}>
        <HomeC2cSectionData
          currentUserId={currentUserId}
          favoredKeys={favoredKeys}
        />
      </Suspense>
    </HomePageShell>
  );
}
