"use client";

import Link from "next/link";
import { TopNav } from "@/app/components/navigation/TopNav";
import { MobileHeader } from "@/app/components/navigation/MobileHeader";
import { BottomNav } from "@/app/components/navigation/BottomNav";
import { MarketplaceCard } from "@/app/components/marketplace/MarketplaceCard";
import { PublicPersonaProfileHeader } from "@/app/components/profile/PublicPersonaProfileHeader";
import { PublicReviewPreviewCard } from "@/app/components/profile/PublicReviewPreviewCard";
import type { PublicProfilePageBootstrap } from "@/app/actions/profile";
import { resolveSellerStorefrontPath } from "@/lib/marketplace/seller-identity";
import { PRODUCT_DETAIL_SECTION_TITLE_CLASS } from "@/app/marketplace/product/[id]/product-detail-ui";
import {
  PUBLIC_PROFILE_BACK_CLASS,
  PUBLIC_PROFILE_CARD_CLASS,
  PUBLIC_PROFILE_MAIN_CLASS,
  PUBLIC_PROFILE_SECTION_BODY_CLASS,
  PUBLIC_PROFILE_SECTION_GRID_BODY_CLASS,
  PUBLIC_PROFILE_SECTION_HEADER_CLASS,
} from "./public-profile-ui";
import { IoChevronBack } from "react-icons/io5";
import { useRouter } from "next/navigation";

type PublicProfileClientProps = {
  initialData: PublicProfilePageBootstrap | null;
  bootstrapError?: string;
};

function SectionWarning({ message }: { message: string }) {
  return (
    <p className="font-sans text-[13px] text-warning mb-3">{message}</p>
  );
}

export function PublicProfileClient({
  initialData,
  bootstrapError,
}: PublicProfileClientProps) {
  const router = useRouter();

  if (!initialData) {
    return (
      <div className="min-h-dvh bg-[#17130f] text-[#eae1da] flex flex-col items-center justify-center">
        <h1 className="text-xl font-sans font-bold text-text-disabled">
          {bootstrapError ?? "找不到此用戶檔案"}
        </h1>
        <Link
          href="/marketplace"
          className="text-brand text-sm mt-2 hover:underline"
        >
          ← 返回交易所大盤
        </Link>
      </div>
    );
  }

  const {
    profile,
    reviewPersona,
    listings,
    totalListingCount,
    recentReviews,
    warnings,
  } = initialData;

  const isMerchantPersona = reviewPersona === "merchant";
  const listingsWarning = warnings.listings;
  const reviewsWarning = warnings.reviews;

  return (
    <div className="min-h-[100dvh] bg-[#17130f] flex flex-col text-[#eae1da]">
      <TopNav />
      <MobileHeader />

      <main className={PUBLIC_PROFILE_MAIN_CLASS}>
        <button
          type="button"
          onClick={() => router.back()}
          className={PUBLIC_PROFILE_BACK_CLASS}
        >
          <IoChevronBack className="size-3.5" />
          返回
        </button>

        <div className={PUBLIC_PROFILE_CARD_CLASS}>
          <PublicPersonaProfileHeader
            profile={profile}
            rating={profile.rating}
            reviewCount={profile.reviewCount}
            variant="public-profile"
            viewPersona={reviewPersona}
          />
        </div>

        <section className={PUBLIC_PROFILE_CARD_CLASS}>
          <div className={PUBLIC_PROFILE_SECTION_HEADER_CLASS}>
            <h2 className={PRODUCT_DETAIL_SECTION_TITLE_CLASS}>
              {isMerchantPersona ? "上架中的商品" : "公開掛單"}
              <span className="text-[#8A8680] font-normal text-[13px]">
                （{totalListingCount}）
              </span>
            </h2>
            {totalListingCount > 0 ? (
              <Link
                href={resolveSellerStorefrontPath(profile.id, reviewPersona)}
                className="font-mono text-[11px] text-brand hover:text-[#e8b896] font-bold transition-colors shrink-0"
              >
                {isMerchantPersona ? "查看櫥窗 →" : "查看掛單 →"}
              </Link>
            ) : null}
          </div>

          <div className={PUBLIC_PROFILE_SECTION_GRID_BODY_CLASS}>
            {listingsWarning ? (
              <div className="px-4 mb-3">
                <SectionWarning message={listingsWarning} />
              </div>
            ) : null}

            {listings.length === 0 ? (
              <p className="font-sans text-[13px] text-text-disabled text-center py-6 px-4">
                {isMerchantPersona ? "暫無上架商品" : "暫無公開掛單"}
              </p>
            ) : (
              <div className="grid grid-cols-3 gap-2 md:gap-3 lg:grid-cols-4 lg:gap-4">
                {listings.slice(0, 9).map((item, index) => (
                  <MarketplaceCard
                    key={item.id}
                    listing={item}
                    showSeller={false}
                    showMerchantBadge={false}
                    imagePriority={index < 3}
                  />
                ))}
              </div>
            )}
          </div>
        </section>

        <section id="rating" className={PUBLIC_PROFILE_CARD_CLASS}>
          <div className={PUBLIC_PROFILE_SECTION_HEADER_CLASS}>
            <h2 className={PRODUCT_DETAIL_SECTION_TITLE_CLASS}>
              最近收到的信用評價
            </h2>
            <Link
              href={`/profile/${profile.id}/rating?persona=${reviewPersona}`}
              className="font-mono text-[11px] text-brand hover:text-brand-hover font-bold transition-colors shrink-0"
            >
              查看更多 →
            </Link>
          </div>

          {reviewsWarning ? (
            <div className="px-4 pt-3">
              <SectionWarning message={reviewsWarning} />
            </div>
          ) : null}

          {recentReviews.length === 0 ? (
            <p className="font-sans text-[13px] text-text-disabled text-center py-8">
              暫無公開評價紀錄
            </p>
          ) : (
            <div>
              {recentReviews.map((review) => (
                <PublicReviewPreviewCard
                  key={review.id}
                  review={review}
                  variant="embedded"
                />
              ))}
            </div>
          )}
        </section>
      </main>

      <BottomNav />
    </div>
  );
}
