import {
  LISTING_IMAGE_MAX,
  LISTING_PHOTO_SLOT_LABELS,
  type ListingImage,
} from "@/lib/listings/images";
import { bunnyObjectKeyFromCdnUrl } from "@/lib/storage/bunny";

/** Create-flow photo slots (AddAssetModal). */
export type CreateListingPhotoSlot = {
  file: File | null;
  previewUrl: string | null;
  description: string;
};

/** Edit-flow photo slots (ListingEditDialog). */
export type EditListingPhotoSlot = {
  previewUrl: string | null;
  file: File | null;
  existingUrl: string | null;
  existingObjectKey: string | null;
  remark: string;
};

export function createEmptyCreatePhotoSlots(): CreateListingPhotoSlot[] {
  return Array.from({ length: LISTING_IMAGE_MAX }, () => ({
    file: null,
    previewUrl: null,
    description: "",
  }));
}

export function buildEditListingPhotoSlots(
  images: ListingImage[],
): EditListingPhotoSlot[] {
  const sorted = [...images].sort((a, b) => a.order - b.order);

  return Array.from({ length: LISTING_IMAGE_MAX }, (_, index) => {
    const image = sorted[index];
    const slotLabel = LISTING_PHOTO_SLOT_LABELS[index] ?? `實體照 ${index + 1}`;

    return {
      previewUrl: image?.url ?? null,
      file: null,
      existingUrl: image?.url ?? null,
      existingObjectKey:
        image?.url != null ? bunnyObjectKeyFromCdnUrl(image.url) : null,
      remark: image?.remark?.trim() || slotLabel,
    };
  });
}
