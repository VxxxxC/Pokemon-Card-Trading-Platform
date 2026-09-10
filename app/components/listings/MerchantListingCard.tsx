"use client";

import Link from "next/link";
import { Store } from "lucide-react";
import type { HomeListingCard } from "@/app/lib/home/types";
import {
  WishlistButton,
  isWishlistFavored,
} from "@/app/components/market/WishlistButton";
import { GradeBadge } from "@/app/components/cards/GradeBadge";
import { ListingCardBody } from "@/app/components/listings/ListingCardBody";
import { ListingCardImage } from "@/app/components/listings/ListingCardImage";
import { ListingCardShell } from "@/app/components/listings/ListingCardShell";
import {
  LISTING_CARD_MERCHANT_IMAGE_SIZES,
  LISTING_CARD_MERCHANT_SHELL_CLASS,
} from "@/app/components/listings/listing-card-tokens";
import {
  hasDisplayableRarity,
  resolveListingMetaLine,
} from "@/app/components/listings/listing-card-utils";

type MerchantListingCardProps = {
  listing: HomeListingCard;
  detailHref: string;
  currentUserId?: string | null;
  favoredKeys?: ReadonlySet<string>;
  showWishlist?: boolean;
  imagePriority?: boolean;
};

export function MerchantListingCard({
  listing,
  detailHref,
  currentUserId = null,
  favoredKeys,
  showWishlist = false,
  imagePriority = false,
}: MerchantListingCardProps) {
  const wishlistIsFavored = isWishlistFavored(
    favoredKeys,
    listing.productId,
    listing.gradingCompany,
    listing.gradingScore,
  );

  return (
    <article className={LISTING_CARD_MERCHANT_SHELL_CLASS}>
      <ListingCardShell
        variant="merchant"
        image={
          <Link
            href={detailHref}
            className="absolute inset-0 block"
            aria-label={`查看 ${listing.name} 商品詳情`}
          >
            <ListingCardImage
              imageUrl={listing.imageUrl}
              catalogImageUrl={listing.catalogImageUrl}
              alt={`${listing.name} — ${listing.gradeLabel}`}
              priority={imagePriority}
              sizes={LISTING_CARD_MERCHANT_IMAGE_SIZES}
              hoverClassName="object-cover group-hover:scale-[1.02] transition-transform duration-500"
            />
          </Link>
        }
        imageOverlays={
          showWishlist ? (
            <div className="absolute top-1.5 right-1.5 z-10 animate-fadeIn">
              <WishlistButton
                productId={listing.productId}
                gradingCompany={listing.gradingCompany}
                gradingScore={listing.gradingScore}
                trackedPrice={listing.price > 0 ? listing.price : null}
                currentUserId={currentUserId}
                size="sm"
                initialIsFavored={wishlistIsFavored}
              />
            </div>
          ) : null
        }
        body={
          <ListingCardBody
            variant="merchant"
            title={listing.name}
            metaLine={resolveListingMetaLine({
              set: listing.setCode,
              cardNo: listing.cardCode || listing.productId,
            })}
            price={listing.price}
            rarity={listing.rarity}
            raritySlotFallback={
              !hasDisplayableRarity(listing.rarity) && listing.gradeLabel ? (
                <GradeBadge
                  authority={listing.gradingCompany}
                  score={listing.gradingScore ?? ""}
                  size="sm"
                />
              ) : null
            }
            showMerchantBadge
            sellerName={listing.sellerName}
            titleHref={detailHref}
          />
        }
        footer={
          <Link
            href={`/profile/${listing.sellerId}`}
            className="w-full h-8 bg-brand hover:bg-brand-hover text-[#17130f] font-sans font-bold text-[11px] rounded-lg transition-all inline-flex items-center justify-center gap-1.5 px-2 cursor-pointer active:scale-[0.98] min-w-0"
          >
            <Store className="size-3.5 shrink-0" aria-hidden />
            <span className="truncate">進入 {listing.sellerName}</span>
          </Link>
        }
      />
    </article>
  );
}
