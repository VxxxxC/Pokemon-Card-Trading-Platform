"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { WishlistButton, isWishlistFavored } from "@/app/components/market/WishlistButton";
import { GradeBadge } from "@/app/components/cards/GradeBadge";
import { BuyButton } from "@/app/components/transactions/GlobalTxButtons";
import { PriceSpreadBadge } from "@/app/components/marketplace/PriceSpreadBadge";
import type { Database, Tables } from "@/types/supabase";
import { useCurrentUserId } from "@/app/lib/hooks/useCurrentUserId";
import { ListingCardBody } from "@/app/components/listings/ListingCardBody";
import { ListingCardImage } from "@/app/components/listings/ListingCardImage";
import { ListingCardShell } from "@/app/components/listings/ListingCardShell";
import {
  getListingCardTokens,
  LISTING_CARD_GRID_IMAGE_SIZES,
  LISTING_CARD_MARKETPLACE_ARTICLE_CLASS,
} from "@/app/components/listings/listing-card-tokens";
import {
  hasDisplayableRarity,
  resolveListingDisplayName,
  resolveListingMetaLine,
  resolveProductDetailHref,
} from "@/app/components/listings/listing-card-utils";

export type MarketplaceListing = {
  /** Active listing id — used by wishlist / buy flows. */
  id: string;
  /** Product catalog id for `/marketplace/product/[id]` navigation. */
  productId?: string;
  cardNo?: string;
  name: string;
  nameZh?: string | null;
  nameJa?: string | null;
  set: string;
  rarity: Tables<"product_catalog">["rarity"];
  grade: { authority: string; score: string };
  /** Raw DB values for wishlist / API — do not use display `grade` for mutations. */
  gradingCompany: string;
  gradingScore: string | null;
  conditionLabel?: "A" | "B" | "C" | "D";
  price: number; // HKD value
  delta: number;
  deltaDirection: "up" | "down";
  marketAvgPrice?: number | null;
  marketReferenceSource?: "snkrdunk" | "platform" | null;
  priceVsMarketPct?: number | null;
  image: string;
  catalogImageUrl?: string | null;
  seller: string;
  sellerId?: string;
  sellerPersona?: Database["public"]["Enums"]["seller_persona_type"];
  detailHref?: string;
  deliverySummary?: string;
  baseCourierShippingFee?: number;
  listingExtraShippingFee?: number;
  courierShippingTotal?: number;
};

interface MarketplaceCardProps {
  listing: MarketplaceListing;
  /** When provided, skips per-card profile fetch (pass from grid parent). */
  currentUserId?: string | null;
  /** Product+grade keys from `getUserWishlistFavoredKeys` for star hydration. */
  favoredKeys?: ReadonlySet<string>;
  imagePriority?: boolean;
  showSeller?: boolean;
  showMerchantBadge?: boolean;
}

export function MarketplaceCard({
  listing,
  currentUserId: currentUserIdProp,
  favoredKeys,
  imagePriority = false,
  showSeller = true,
  showMerchantBadge,
}: MarketplaceCardProps) {
  if (currentUserIdProp !== undefined) {
    return (
      <MarketplaceCardView
        listing={listing}
        currentUserId={currentUserIdProp}
        favoredKeys={favoredKeys}
        imagePriority={imagePriority}
        showSeller={showSeller}
        showMerchantBadge={showMerchantBadge}
      />
    );
  }

  return (
    <MarketplaceCardWithSession
      listing={listing}
      favoredKeys={favoredKeys}
      imagePriority={imagePriority}
      showSeller={showSeller}
      showMerchantBadge={showMerchantBadge}
    />
  );
}

function MarketplaceCardWithSession({
  listing,
  favoredKeys,
  imagePriority,
  showSeller,
  showMerchantBadge,
}: Pick<
  MarketplaceCardProps,
  | "listing"
  | "favoredKeys"
  | "imagePriority"
  | "showSeller"
  | "showMerchantBadge"
>) {
  const currentUserId = useCurrentUserId();
  return (
    <MarketplaceCardView
      listing={listing}
      currentUserId={currentUserId}
      favoredKeys={favoredKeys}
      imagePriority={imagePriority}
      showSeller={showSeller}
      showMerchantBadge={showMerchantBadge}
    />
  );
}

function MarketplaceCardView({
  listing,
  currentUserId,
  favoredKeys,
  imagePriority,
  showSeller = true,
  showMerchantBadge,
}: {
  listing: MarketplaceListing;
  currentUserId: string | null;
  favoredKeys?: ReadonlySet<string>;
  imagePriority?: boolean;
  showSeller?: boolean;
  showMerchantBadge?: boolean;
}) {
  const tokens = getListingCardTokens("grid");
  const isOwnListing =
    currentUserId != null &&
    listing.sellerId != null &&
    listing.sellerId === currentUserId;
  const productDetailHref = resolveProductDetailHref(listing);
  const displayName = resolveListingDisplayName(listing);
  const wishlistProductId = listing.productId ?? listing.id;
  const wishlistIsFavored = isWishlistFavored(
    favoredKeys,
    wishlistProductId,
    listing.gradingCompany,
    listing.gradingScore,
  );
  const shouldShowMerchantBadge =
    showMerchantBadge ?? listing.sellerPersona === "merchant";

  return (
    <div className="h-full">
      <motion.article
        whileHover={{ y: -2, scale: 1.01 }}
        transition={{ type: "spring", stiffness: 300, damping: 25 }}
        className={LISTING_CARD_MARKETPLACE_ARTICLE_CLASS}
      >
        <Link
          href={productDetailHref}
          prefetch
          className="cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 flex flex-col flex-1 min-h-0"
          aria-label={`查看 ${displayName} 商品詳情`}
        >
          <ListingCardShell
            variant="grid"
            image={
              <ListingCardImage
                imageUrl={listing.image}
                catalogImageUrl={listing.catalogImageUrl}
                alt={
                  hasDisplayableRarity(listing.rarity)
                    ? `${displayName} — ${listing.rarity}`
                    : displayName
                }
                priority={imagePriority ?? false}
                sizes={LISTING_CARD_GRID_IMAGE_SIZES}
                hoverClassName="object-cover group-hover:scale-[1.02] transition-transform duration-300"
              />
            }
            imageOverlays={
              <>
                <div className="absolute inset-0 bg-linear-to-tr from-transparent via-[rgba(212,165,116,0.06)] to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />
                <div className="absolute top-1.5 left-1.5 pointer-events-none z-10">
                  <GradeBadge
                    authority={listing.grade.authority}
                    score={listing.grade.score}
                    size="sm"
                  />
                </div>
                <div
                  className="absolute top-1 right-1 z-10"
                  onClick={(event) => event.stopPropagation()}
                  onKeyDown={(event) => event.stopPropagation()}
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
              </>
            }
            body={
              <ListingCardBody
                variant="grid"
                title={displayName}
                metaLine={resolveListingMetaLine({
                  set: listing.set,
                  cardNo: listing.cardNo ?? listing.id,
                })}
                price={listing.price}
                rarity={listing.rarity}
                showMerchantBadge={shouldShowMerchantBadge}
                sellerName={listing.seller}
                showSeller={showSeller}
                isOwnListing={isOwnListing}
                priceAccessory={
                  listing.priceVsMarketPct != null ? (
                    <PriceSpreadBadge
                      priceVsMarketPct={listing.priceVsMarketPct}
                      className="text-[9px] min-w-0 truncate shrink-0"
                    />
                  ) : null
                }
              />
            }
          />
        </Link>

        <div
          className={`${tokens.action} mt-auto shrink-0 w-full`}
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
        >
          {isOwnListing ? (
            <button type="button" disabled className={tokens.ownListingButton}>
              我的掛單 · 無法出價
            </button>
          ) : (
            <BuyButton
              listing={listing}
              className={tokens.buyButton}
              currentUserId={currentUserId}
            />
          )}
        </div>
      </motion.article>
    </div>
  );
}
