"use client";

import { useState } from "react";
import Image from "next/image";

type ListingCardImageProps = {
  imageUrl: string;
  catalogImageUrl?: string | null;
  alt: string;
  priority?: boolean;
  sizes: string;
  hoverClassName?: string;
};

function ListingCardImageInner({
  imageUrl,
  catalogImageUrl,
  alt,
  priority = false,
  sizes,
  hoverClassName = "object-cover group-hover:scale-[1.05] transition-transform duration-500 pointer-events-none",
}: ListingCardImageProps) {
  const primarySrc = imageUrl.trim() || catalogImageUrl?.trim() || "";
  const catalogSrc = catalogImageUrl?.trim() ?? "";
  const [errorStage, setErrorStage] = useState<0 | 1 | 2>(0);
  const src =
    errorStage === 0 ? primarySrc : errorStage === 1 ? catalogSrc : "";

  const handleError = () => {
    if (errorStage === 0 && catalogSrc && primarySrc !== catalogSrc) {
      setErrorStage(1);
      return;
    }
    setErrorStage(2);
  };

  if (!src || errorStage === 2) {
    return (
      <div className="absolute inset-0 flex items-center justify-center bg-[#1A1612] text-text-disabled font-mono text-[10px]">
        暫無圖片
      </div>
    );
  }

  return (
    <Image
      src={src}
      alt={alt}
      fill
      className={hoverClassName}
      sizes={sizes}
      priority={priority}
      onError={handleError}
    />
  );
}

export function ListingCardImage(props: ListingCardImageProps) {
  return (
    <ListingCardImageInner
      key={`${props.imageUrl}|${props.catalogImageUrl ?? ""}`}
      {...props}
    />
  );
}
