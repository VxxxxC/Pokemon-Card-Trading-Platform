"use client";

import Image from "next/image";
import {
  LISTING_IMAGE_MAX,
  LISTING_PHOTO_SLOT_LABELS,
} from "@/lib/listings/images";
import type {
  CreateListingPhotoSlot,
  EditListingPhotoSlot,
} from "@/lib/listings/card-listing-photo-slots";

type CardListingPhotoGridProps = {
  mode: "create" | "edit";
  itemKind: "card" | "box_set";
  createSlots?: CreateListingPhotoSlot[];
  editSlots?: EditListingPhotoSlot[];
  onCreateSlotClick?: (index: number) => void;
  onCreateSlotRemove?: (index: number) => void;
  onCreateDescriptionChange?: (index: number, value: string) => void;
  onEditReplaceClick?: (index: number) => void;
  onEditViewerOpen?: (index: number) => void;
  onEditRemarkChange?: (index: number, value: string) => void;
  compactEditLabels?: boolean;
};

export function CardListingPhotoGrid({
  mode,
  itemKind,
  createSlots = [],
  editSlots = [],
  onCreateSlotClick,
  onCreateSlotRemove,
  onCreateDescriptionChange,
  onEditReplaceClick,
  onEditViewerOpen,
  onEditRemarkChange,
  compactEditLabels = false,
}: CardListingPhotoGridProps) {
  const filledCount =
    mode === "create"
      ? createSlots.filter((slot) => slot.file).length
      : editSlots.filter((slot) => slot.previewUrl).length;

  const requiredLabel =
    itemKind === "box_set" ? "至少 1 張" : `${LISTING_IMAGE_MAX} 張`;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <label className="font-mono text-[10px] text-[#8A8680]">
          實體相片
          <span className="text-[#50453b]"> · {requiredLabel}</span>
          <span className="text-brand"> *</span>
        </label>
        <span className="font-mono text-[10px] text-[#8A8680] shrink-0 tabular-nums">
          {filledCount}/{LISTING_IMAGE_MAX}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-1">
        {Array.from({ length: LISTING_IMAGE_MAX }, (_, index) => {
          const slotLabel =
            itemKind === "card" ? LISTING_PHOTO_SLOT_LABELS[index] : null;
          const isRequired =
            itemKind === "box_set" ? index < 1 : index < LISTING_IMAGE_MAX;

          if (mode === "create") {
            const photo = createSlots[index];
            if (!photo) return null;

            return (
              <div key={index} className="min-w-0">
                <div
                  className={`relative aspect-[5/6] rounded-md border border-dashed flex flex-col items-center justify-center cursor-pointer transition-all overflow-hidden ${
                    photo.previewUrl
                      ? "border-brand/30 bg-[#17130f]"
                      : isRequired
                        ? "border-brand/35 bg-brand/5"
                        : "border-white/[0.08] bg-[#17130f] hover:border-brand/25"
                  }`}
                  onClick={() => onCreateSlotClick?.(index)}
                >
                  {slotLabel && !photo.previewUrl ? (
                    <span className="absolute bottom-0 inset-x-0 bg-black/55 font-mono text-[8px] text-[#d4c4b7] text-center py-0.5 truncate px-0.5">
                      {slotLabel}
                    </span>
                  ) : null}
                  {photo.previewUrl ? (
                    <>
                      <Image
                        src={photo.previewUrl}
                        alt={slotLabel ?? `實體照 ${index + 1}`}
                        fill
                        className="object-cover"
                        unoptimized
                      />
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onCreateSlotRemove?.(index);
                        }}
                        className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/80 text-white hover:bg-brand hover:text-[#1A1612] flex items-center justify-center font-sans text-[10px] font-black cursor-pointer transition-colors focus:outline-none"
                      >
                        ✕
                      </button>
                    </>
                  ) : (
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke={isRequired ? "#d4a574" : "#50453b"}
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <line x1="12" y1="5" x2="12" y2="19" />
                      <line x1="5" y1="12" x2="19" y2="12" />
                    </svg>
                  )}
                </div>
                {itemKind === "box_set" ? (
                  <input
                    type="text"
                    value={photo.description}
                    onChange={(e) =>
                      onCreateDescriptionChange?.(index, e.target.value)
                    }
                    placeholder={`相片 ${index + 1}`}
                    className="mt-1 w-full bg-[#17130f] border border-white/[0.06] rounded-md px-1.5 py-1 font-sans text-[10px] text-text-primary placeholder-[#8A8680] text-center focus:outline-none focus:border-brand/40 transition-all focus:ring-0"
                  />
                ) : null}
              </div>
            );
          }

          const slot = editSlots[index];
          if (!slot) return null;
          const label = slotLabel ?? `實體照 ${index + 1}`;

          return (
            <div key={index} className="min-w-0">
              <div className="relative aspect-[5/6] rounded-md border border-white/[0.08] overflow-hidden bg-[#17130f]">
                {slot.previewUrl ? (
                  <>
                    <button
                      type="button"
                      onClick={() => onEditViewerOpen?.(index)}
                      className="absolute inset-0 cursor-zoom-in"
                      aria-label={`預覽${label}`}
                    >
                      <Image
                        src={slot.previewUrl}
                        alt={label}
                        fill
                        className="object-cover"
                        unoptimized
                      />
                    </button>
                    {compactEditLabels && slotLabel ? (
                      <span className="absolute bottom-0 inset-x-0 z-[1] bg-black/60 font-mono text-[8px] text-[#d4c4b7] text-center py-0.5 truncate px-0.5 pointer-events-none">
                        {slotLabel}
                      </span>
                    ) : null}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onEditReplaceClick?.(index);
                      }}
                      className="absolute bottom-0.5 right-0.5 z-10 rounded bg-black/75 px-1 py-0.5 font-mono text-[8px] text-brand"
                    >
                      更換
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => onEditReplaceClick?.(index)}
                    className="flex h-full w-full flex-col items-center justify-center gap-1"
                  >
                    {slotLabel ? (
                      <span className="font-mono text-[8px] text-[#8A8680]">
                        {slotLabel}
                      </span>
                    ) : null}
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="#50453b"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <line x1="12" y1="5" x2="12" y2="19" />
                      <line x1="5" y1="12" x2="19" y2="12" />
                    </svg>
                  </button>
                )}
              </div>
              {!compactEditLabels ? (
                <input
                  type="text"
                  value={slot.remark}
                  onChange={(e) => onEditRemarkChange?.(index, e.target.value)}
                  placeholder={label}
                  className="mt-1 w-full bg-[#17130f] border border-white/[0.06] rounded-md px-1.5 py-1 font-sans text-[10px] text-text-primary placeholder-[#8A8680] text-center focus:outline-none focus:border-brand/40 transition-all focus:ring-0"
                />
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
