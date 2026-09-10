"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { CertifiedMerchantBadge } from "@/app/components/profile/CertifiedMerchantBadge";
import { RarityBadge } from "@/app/components/cards/RarityBadge";
import {
  formatListingPriceHkd,
  hasDisplayableRarity,
  type ListingCardRarity,
} from "@/app/components/listings/listing-card-utils";
import {
  getListingCardTokens,
  type ListingCardVariant,
} from "@/app/components/listings/listing-card-tokens";

export type ListingCardBodyProps = {
  variant: ListingCardVariant;
  title: string;
  metaLine: string;
  price: number;
  rarity?: ListingCardRarity;
  raritySlotFallback?: ReactNode;
  showMerchantBadge?: boolean;
  sellerName?: string;
  showSeller?: boolean;
  isOwnListing?: boolean;
  priceAccessory?: ReactNode;
  titleHref?: string;
};

export function ListingCardBody({
  variant,
  title,
  metaLine,
  price,
  rarity,
  raritySlotFallback,
  showMerchantBadge = false,
  sellerName,
  showSeller = true,
  isOwnListing = false,
  priceAccessory,
  titleHref,
}: ListingCardBodyProps) {
  const tokens = getListingCardTokens(variant);
  const formattedPrice = formatListingPriceHkd(price);

  const titleNode = titleHref ? (
    <Link href={titleHref}>
      <h3 className={tokens.title}>{title}</h3>
    </Link>
  ) : (
    <h3 className={tokens.title}>{title}</h3>
  );

  return (
    <div className={tokens.body}>
      <div className={tokens.topStack}>
        {titleNode}
        <p className={tokens.meta}>{metaLine}</p>
        <div className="min-h-[18px] pt-0.5">
          {rarity != null && hasDisplayableRarity(rarity) ? (
            <RarityBadge rarity={rarity} size="sm" />
          ) : (
            raritySlotFallback
          )}
        </div>
      </div>

      <div className="mt-auto flex flex-col gap-1 pt-2">
        <div className="flex items-end gap-1 min-w-0">
          <p className={tokens.price}>{formattedPrice}</p>
          {priceAccessory}
        </div>
        {showMerchantBadge || (showSeller && sellerName) ? (
          <div className="flex items-center gap-1 min-w-0 min-h-[18px]">
            {showMerchantBadge ? (
              <CertifiedMerchantBadge size="compact" />
            ) : null}
            {showSeller && sellerName ? (
              <span className="font-sans text-[10px] text-text-secondary truncate leading-tight min-w-0">
                {sellerName}
                {isOwnListing ? (
                  <span className="text-brand font-bold"> (你)</span>
                ) : null}
              </span>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
