"use client";

import Image from "next/image";

type OrderListingPhotoGridProps = {
  images: string[];
  altPrefix: string;
  label?: string;
  remarks?: (string | undefined)[];
  onImageClick: (index: number) => void;
};

export function OrderListingPhotoGrid({
  images,
  altPrefix,
  label = "實物照",
  remarks,
  onImageClick,
}: OrderListingPhotoGridProps) {
  if (images.length === 0) {
    return null;
  }

  return (
    <div className="w-full select-none">
      <span className="font-mono text-[10px] text-[#8A8680] uppercase block mb-2">
        {label} ({images.length})
      </span>
      <div className="grid grid-cols-3 gap-2">
        {images.map((imageUrl, idx) => {
          const remarkText = remarks?.[idx];
          return (
            <button
              key={imageUrl + "-" + idx}
              type="button"
              onClick={() => onImageClick(idx)}
              className="relative aspect-[3/4] rounded-lg overflow-hidden bg-[#120f0c] border border-white/5 cursor-zoom-in"
            >
              <Image
                src={imageUrl}
                alt={`${altPrefix} ${idx + 1}`}
                fill
                sizes="(max-width: 768px) 30vw, 120px"
                className="object-cover hover:scale-105 transition-transform duration-300"
                unoptimized
              />
              {remarkText ? (
                <div className="absolute bottom-0 left-0 right-0 bg-black/75 backdrop-blur-xs py-0.5 px-1 text-center border-t border-white/5 pointer-events-none select-none">
                  <p className="font-sans text-[9px] text-[#eae1da] truncate font-bold leading-normal">
                    {remarkText}
                  </p>
                </div>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
