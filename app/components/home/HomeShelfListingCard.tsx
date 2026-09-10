"use client";

import { type MouseEvent } from "react";
import { useRouter } from "next/navigation";
import {
  type MarketplaceListing,
} from "@/app/components/marketplace/MarketplaceCard";
import { BuyButton } from "@/app/components/transactions/GlobalTxButtons";
import {
  WishlistButton,
  isWishlistFavored,
} from "@/app/components/market/WishlistButton";
import { GradeBadge } from "@/app/components/cards/GradeBadge";
import { ListingCardBody } from "@/app/components/listings/ListingCardBody";
import { ListingCardImage } from "@/app/components/listings/ListingCardImage";
import { ListingCardShell } from "@/app/components/listings/ListingCardShell";
import {
  getListingCardTokens,
  LISTING_CARD_GRID_IMAGE_SIZES,
  LISTING_CARD_SHELL_CLASS,
  LISTING_CARD_SHELF_IMAGE_SIZES,
  type ListingCardVariant,
} from "@/app/components/listings/listing-card-tokens";
import {
  hasDisplayableRarity,
  resolveListingDisplayName,
  resolveListingMetaLine,
  resolveProductDetailHref,
} from "@/app/components/listings/listing-card-utils";

export type HomeShelfListingCardProps = {
  listing: MarketplaceListing;
  currentUserId?: string | null;
  favoredKeys?: ReadonlySet<string>;
  imagePriority?: boolean;
  catalogImageUrl?: string | null;
  listedLabel?: string | null;
  showWishlist?: boolean;
  showSeller?: boolean;
  showMerchantBadge?: boolean;
  className?: string;
  layout?: "shelf" | "grid";
  onLinkClick?: (event: MouseEvent<HTMLAnchorElement>) => void;
};

export function HomeShelfListingCard({
  listing,
  currentUserId = null,
  favoredKeys,
  imagePriority = false,
  catalogImageUrl,
  listedLabel,
  showWishlist = true,
  showSeller = true,
  showMerchantBadge = true,
  className,
  layout = "shelf",
  onLinkClick,
}: HomeShelfListingCardProps) {
  const router = useRouter();
  const isOwnListing =
    currentUserId != null &&
    listing.sellerId != null &&
    listing.sellerId === currentUserId;
  const productDetailHref = resolveProductDetailHref(listing);
  const displayName = resolveListingDisplayName(listing);
  const variant: ListingCardVariant = layout === "grid" ? "grid" : "shelf";
  const tokens = getListingCardTokens(variant);
  const wishlistProductId = listing.productId ?? listing.id;
  const wishlistIsFavored = isWishlistFavored(
    favoredKeys,
    wishlistProductId,
    listing.gradingCompany,
    listing.gradingScore,
  );

  const handleCardActivate = (event: MouseEvent<HTMLElement>) => {
    if (event.defaultPrevented) {
      return;
    }

    const target = event.target as HTMLElement;
    if (target.closest("[data-shelf-card-action]")) {
      return;
    }

    if (onLinkClick) {
      onLinkClick(event as unknown as MouseEvent<HTMLAnchorElement>);
      if (event.defaultPrevented) {
        return;
      }
    }

    router.push(productDetailHref);
  };

  return (
    <div className="h-full">
      <article
        role="link"
        tabIndex={0}
        onClick={handleCardActivate}
        onKeyDown={(event) => {
          if (event.key !== "Enter" && event.key !== " ") {
            return;
          }
          event.preventDefault();
          handleCardActivate(event as unknown as MouseEvent<HTMLElement>);
        }}
        className={`relative cursor-pointer ${LISTING_CARD_SHELL_CLASS} ${className ?? ""}`}
      >
        <ListingCardShell
          variant={variant}
          listedLabel={listedLabel}
          image={
            <ListingCardImage
              imageUrl={listing.image}
              catalogImageUrl={catalogImageUrl ?? listing.catalogImageUrl}
              alt={
                hasDisplayableRarity(listing.rarity)
                  ? `${displayName} — ${listing.rarity}`
                  : displayName
              }
              priority={imagePriority}
              sizes={
                variant === "grid"
                  ? LISTING_CARD_GRID_IMAGE_SIZES
                  : LISTING_CARD_SHELF_IMAGE_SIZES
              }
            />
          }
          imageOverlays={
            <>
              <div className="absolute top-1.5 left-1.5 pointer-events-none z-10">
                <GradeBadge
                  authority={listing.grade.authority}
                  score={listing.grade.score}
                  size="sm"
                />
              </div>
              {showWishlist ? (
                <div
                  className="absolute top-1 right-1 z-20"
                  data-shelf-card-action="true"
                >
                  <WishlistButton
                    productId={wishlistProductId}
                    gradingCompany={listing.gradingCompany}
                    gradingScore={listing.gradingScore}
                    trackedPrice={listing.price > 0 ? listing.price : null}
                    initialIsFavored={wishlistIsFavored}
                    currentUserId={currentUserId}
                    size="sm"
                  />
                </div>
              ) : null}
            </>
          }
          body={
            <ListingCardBody
              variant={variant}
              title={displayName}
              metaLine={resolveListingMetaLine({
                set: listing.set,
                cardNo: listing.cardNo ?? listing.id,
              })}
              price={listing.price}
              rarity={listing.rarity}
              showMerchantBadge={
                showMerchantBadge && listing.sellerPersona === "merchant"
              }
              sellerName={listing.seller}
              showSeller={showSeller}
              isOwnListing={isOwnListing}
            />
          }
          footer={
            isOwnListing ? (
              <button
                type="button"
                disabled
                className={tokens.ownListingButton}
              >
                我的掛單 · 無法出價
              </button>
            ) : (
              <BuyButton
                listing={listing}
                className={tokens.buyButton}
                currentUserId={currentUserId}
              />
            )
          }
          footerWrapperProps={
            isOwnListing
              ? undefined
              : { "data-shelf-card-action": "true" as const }
          }
        />
      </article>
    </div>
  );
}
