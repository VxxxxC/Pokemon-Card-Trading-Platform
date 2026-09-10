"use client";

import { useState } from "react";
import { Zap } from "lucide-react";
import { useCurrentUserId } from "@/app/lib/hooks/useCurrentUserId";
import { useUIStore } from "@/app/store/useUIStore";
import { mapMarketplaceListingToExecutionPayload } from "@/lib/marketplace/map-listing-to-execution";
import { prefetchMarketplaceListingDetail } from "@/app/lib/hooks/useMarketplaceListingDetail";
import { buildSellerListingDetailHref } from "@/lib/marketplace/listing-detail-href";
import { type MarketplaceListing } from "../marketplace/MarketplaceCard";
import {
  BuyNowConfirmDialog,
  BuyNowGuestLockDialog,
} from "./BuyNowConfirmDialog";

interface GlobalButtonProps {
  listing: MarketplaceListing;
  className?: string;
  label?: string;
  /** When provided, skips per-button profile fetch (pass from grid parent). */
  currentUserId?: string | null;
}

export function BuyButton({
  listing,
  className = "",
  label,
  currentUserId: currentUserIdProp,
}: GlobalButtonProps) {
  if (currentUserIdProp !== undefined) {
    return (
      <BuyButtonView
        listing={listing}
        className={className}
        label={label}
        currentUserId={currentUserIdProp}
      />
    );
  }

  return (
    <BuyButtonWithSession
      listing={listing}
      className={className}
      label={label}
    />
  );
}

function BuyButtonWithSession({
  listing,
  className,
  label,
}: Pick<GlobalButtonProps, "listing" | "className" | "label">) {
  const currentUserId = useCurrentUserId();
  return (
    <BuyButtonView
      listing={listing}
      className={className}
      label={label}
      currentUserId={currentUserId}
    />
  );
}

function BuyButtonView({
  listing,
  className = "",
  label,
  currentUserId,
}: GlobalButtonProps & { currentUserId: string | null }) {
  const userAuthRole = useUIStore((state) => state.userAuthRole);
  const isGuest = userAuthRole === "GUEST";

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [guestLockOpen, setGuestLockOpen] = useState(false);

  const listingId = listing.id?.trim() ?? "";
  const sellerId = listing.sellerId?.trim() ?? "";
  const guestRedirectPath =
    sellerId && listingId
      ? buildSellerListingDetailHref(sellerId, listingId)
      : "/marketplace";

  const isOwnListing =
    currentUserId != null &&
    listing.sellerId != null &&
    listing.sellerId === currentUserId;

  const handleBuy = () => {
    if (isOwnListing) {
      return;
    }

    if (isGuest) {
      setGuestLockOpen(true);
      return;
    }

    setConfirmOpen(true);
  };

  return (
    <>
      <button
        type="button"
        onClick={handleBuy}
        onMouseEnter={() => {
          if (listingId) {
            prefetchMarketplaceListingDetail(listingId);
          }
        }}
        disabled={isOwnListing}
        className={`h-7 px-1 bg-brand text-[#1A1612] font-sans font-bold text-[10px] tracking-wide whitespace-nowrap truncate rounded-lg hover:bg-[#e8b896] active:scale-95 transition-all flex items-center justify-center gap-0.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
      >
        {label ? (
          label
        ) : (
          <>
            <Zap className="size-3 shrink-0" strokeWidth={2.25} />
            立即購買
          </>
        )}
      </button>

      <BuyNowConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        listing={listing}
      />

      <BuyNowGuestLockDialog
        open={guestLockOpen}
        onOpenChange={setGuestLockOpen}
        redirectPath={guestRedirectPath}
      />
    </>
  );
}

export function NegotiateButton({
  listing,
  className = "",
  label = "議價出價",
  currentUserId: currentUserIdProp,
}: GlobalButtonProps) {
  if (currentUserIdProp !== undefined) {
    return (
      <NegotiateButtonView
        listing={listing}
        className={className}
        label={label}
        currentUserId={currentUserIdProp}
      />
    );
  }

  return (
    <NegotiateButtonWithSession
      listing={listing}
      className={className}
      label={label}
    />
  );
}

function NegotiateButtonWithSession({
  listing,
  className,
  label,
}: Pick<GlobalButtonProps, "listing" | "className" | "label">) {
  const currentUserId = useCurrentUserId();
  return (
    <NegotiateButtonView
      listing={listing}
      className={className}
      label={label}
      currentUserId={currentUserId}
    />
  );
}

function NegotiateButtonView({
  listing,
  className = "",
  label,
  currentUserId,
}: GlobalButtonProps & { currentUserId: string | null }) {
  const userAuthRole = useUIStore((state) => state.userAuthRole);
  const isGuest = userAuthRole === "GUEST";
  const openExecutionSlideOver = useUIStore(
    (state) => state.openExecutionSlideOver,
  );

  const [guestLockOpen, setGuestLockOpen] = useState(false);

  const listingId = listing.id?.trim() ?? "";
  const sellerId = listing.sellerId?.trim() ?? "";
  const guestRedirectPath =
    sellerId && listingId
      ? buildSellerListingDetailHref(sellerId, listingId)
      : "/marketplace";

  const isOwnListing =
    currentUserId != null &&
    listing.sellerId != null &&
    listing.sellerId === currentUserId;

  const handleNegotiate = () => {
    if (isOwnListing) {
      return;
    }

    if (isGuest) {
      setGuestLockOpen(true);
      return;
    }

    const payload = mapMarketplaceListingToExecutionPayload(listing);
    if (!payload) {
      return;
    }
    openExecutionSlideOver(payload);
  };

  return (
    <>
      <button
        type="button"
        onClick={handleNegotiate}
        disabled={isOwnListing}
        className={`h-8 px-2 border border-brand/35 text-brand font-sans font-bold text-[10px] tracking-wide whitespace-nowrap truncate rounded-lg bg-transparent hover:bg-brand/10 active:scale-95 transition-all flex items-center justify-center cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
      >
        {label}
      </button>

      <BuyNowGuestLockDialog
        open={guestLockOpen}
        onOpenChange={setGuestLockOpen}
        redirectPath={guestRedirectPath}
      />
    </>
  );
}
