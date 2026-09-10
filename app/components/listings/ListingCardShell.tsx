"use client";

import type { ComponentProps, ReactNode } from "react";
import {
  getListingCardTokens,
  type ListingCardVariant,
} from "@/app/components/listings/listing-card-tokens";

export type ListingCardShellProps = {
  variant: ListingCardVariant;
  imageOverlays?: ReactNode;
  listedLabel?: string | null;
  image: ReactNode;
  body: ReactNode;
  footer?: ReactNode;
  imageAreaClassName?: string;
  footerWrapperProps?: ComponentProps<"div"> & {
    "data-shelf-card-action"?: string;
  };
};

export function ListingCardShell({
  variant,
  imageOverlays,
  listedLabel,
  image,
  body,
  footer,
  imageAreaClassName,
  footerWrapperProps,
}: ListingCardShellProps) {
  const tokens = getListingCardTokens(variant);

  return (
    <div className="relative flex flex-col flex-1 min-h-0">
      <div className={`${imageAreaClassName ?? tokens.imageArea} group`}>
        {image}
        {imageOverlays}
        {listedLabel ? (
          <span className="absolute bottom-0 right-0 left-0 text-center font-mono text-[10px] text-text-disabled bg-[rgba(23,19,15,0.75)] backdrop-blur-md py-1 pointer-events-none">
            {listedLabel}
          </span>
        ) : null}
      </div>

      {body}

      {footer ? (
        <div
          className={`${tokens.action} w-full mt-auto shrink-0`}
          {...footerWrapperProps}
        >
          {footer}
        </div>
      ) : null}
    </div>
  );
}
