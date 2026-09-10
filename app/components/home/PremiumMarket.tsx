"use client";

import * as React from "react";
import Link from "next/link";
import Autoplay from "embla-carousel-autoplay";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
} from "@/components/ui/carousel";
import type { HomeListingCard } from "@/app/lib/home/types";
import { useIsMemberPersonaActive } from "@/app/lib/hooks/useIsMemberPersonaActive";
import { buildSellerListingDetailHref } from "@/lib/marketplace/listing-detail-href";
import { MerchantListingCard } from "@/app/components/listings/MerchantListingCard";
import {
  HOME_SECTION_CLASS,
  HOME_SECTION_HEADER_ROW_CLASS,
  HOME_SECTION_LINK_CLASS,
  HOME_SECTION_TITLE_CLASS,
} from "@/app/components/home/home-section-ui";

type PremiumMarketProps = {
  listings?: HomeListingCard[];
  currentUserId?: string | null;
  favoredKeys?: string[];
};

export function PremiumMarket({
  listings = [],
  currentUserId = null,
  favoredKeys = [],
}: PremiumMarketProps) {
  const isMemberPersonaActive = useIsMemberPersonaActive();
  const showWishlist = currentUserId != null && isMemberPersonaActive;
  const favoredKeySet = new Set(favoredKeys);

  const plugin = React.useMemo(
    () =>
      Autoplay({
        delay: 2500,
        playOnInit: listings.length > 1,
        stopOnInteraction: false,
        stopOnMouseEnter: true,
        stopOnFocusIn: true,
      }),
    [listings.length],
  );

  return (
    <section
      className={HOME_SECTION_CLASS}
      aria-labelledby="premium-heading"
    >
      <div className={HOME_SECTION_HEADER_ROW_CLASS}>
        <h2 id="premium-heading" className={HOME_SECTION_TITLE_CLASS}>
          認證商家・鑑定託管保障
        </h2>
        <Link href="/marketplace?source=merchant" className={HOME_SECTION_LINK_CLASS}>
          查看全部 →
        </Link>
      </div>

      {listings.length === 0 ? (
        <p className="font-sans text-[13px] text-text-secondary py-6 text-center border border-[rgba(237,232,224,0.08)] rounded-xl bg-bg-card">
          暫無認證商家現貨上架
        </p>
      ) : (
        <Carousel
          plugins={[plugin]}
          className="w-full"
          onMouseEnter={plugin.stop}
          onMouseLeave={plugin.reset}
          opts={{
            align: "start",
            loop: listings.length > 1,
          }}
        >
          <CarouselContent className="-ml-2">
            {listings.map((listing, index) => {
              const detailHref = buildSellerListingDetailHref(
                listing.sellerId,
                listing.listingId,
              );

              return (
                <CarouselItem
                  key={listing.listingId}
                  className="pl-2 basis-2/3 sm:basis-[27%] lg:basis-[17%]"
                >
                  <MerchantListingCard
                    listing={listing}
                    detailHref={detailHref}
                    currentUserId={currentUserId}
                    favoredKeys={favoredKeySet}
                    showWishlist={showWishlist}
                    imagePriority={index < 3}
                  />
                </CarouselItem>
              );
            })}
          </CarouselContent>
        </Carousel>
      )}
    </section>
  );
}
