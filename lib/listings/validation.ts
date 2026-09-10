import { hasGradingOption } from "@/lib/grading/options";
import { parseSealState } from "@/lib/catalog/item-kind";
import { validateImageUpload } from "@/lib/listings/image-files";
import {
  LISTING_IMAGE_MAX,
  LISTING_IMAGE_MIN,
  SEALED_LISTING_IMAGE_MIN,
} from "@/lib/listings/images";

export const LISTING_DESCRIPTION_MAX = 500;

export type CreateCardListingFields = {
  productId: string;
  gradingOptionId: string;
  price: number;
  sellerDescription?: string;
};

export function isSealedGradingOptionId(id: string): boolean {
  if (!id.startsWith("sealed:")) {
    return false;
  }

  return parseSealState(id.slice("sealed:".length)) != null;
}

export function isValidListingGradingOptionId(id: string): boolean {
  return hasGradingOption(id) || isSealedGradingOptionId(id);
}

export function validateImageFile(file: File): string | null {
  return validateImageUpload({
    size: file.size,
    type: file.type,
    name: file.name,
  });
}

export function validateListingImageCount(count: number): string | null {
  if (count < LISTING_IMAGE_MIN) {
    return "必須上載全部 6 張卡牌相片（正面、背面及四個角）";
  }
  if (count > LISTING_IMAGE_MAX) {
    return `最多只能上載 ${LISTING_IMAGE_MAX} 張相片`;
  }
  return null;
}

export function validateListingImageFiles(files: File[]): string | null {
  const countError = validateListingImageCount(files.length);
  if (countError) return countError;

  for (const file of files) {
    const error = validateImageFile(file);
    if (error) return error;
  }

  return null;
}

export function validateCreateCardListingFields(
  input: CreateCardListingFields,
): string | null {
  if (!input.productId.trim()) {
    return "請從搜尋結果中選擇一張卡牌";
  }

  if (!isValidListingGradingOptionId(input.gradingOptionId)) {
    return "請選擇有效的鑑定／品相";
  }

  if (!Number.isFinite(input.price) || input.price <= 0) {
    return "請輸入有效的商品放售售價";
  }

  if (
    input.sellerDescription &&
    input.sellerDescription.length > LISTING_DESCRIPTION_MAX
  ) {
    return `品相描述不可超過 ${LISTING_DESCRIPTION_MAX} 字`;
  }

  return null;
}

export function validateCreateCardListing(
  input: CreateCardListingFields,
  imageFiles: File[],
): string | null {
  const fieldError = validateCreateCardListingFields(input);
  if (fieldError) return fieldError;

  return validateListingImageFiles(imageFiles);
}

export type CreateSealedListingFields = {
  productId: string;
  price: number;
  sellerDescription?: string;
};

export function validateSealedListingImageCount(count: number): string | null {
  if (count < SEALED_LISTING_IMAGE_MIN) {
    return "必須上載至少 1 張商品實物相片";
  }
  if (count > LISTING_IMAGE_MAX) {
    return `最多只能上載 ${LISTING_IMAGE_MAX} 張相片`;
  }
  return null;
}

export function validateSealedListingImageFiles(files: File[]): string | null {
  const countError = validateSealedListingImageCount(files.length);
  if (countError) return countError;

  for (const file of files) {
    const error = validateImageFile(file);
    if (error) return error;
  }

  return null;
}

export function validateCreateSealedListingFields(
  input: CreateSealedListingFields,
): string | null {
  if (!input.productId.trim()) {
    return "請從搜尋結果中選擇商品";
  }

  if (!Number.isFinite(input.price) || input.price <= 0) {
    return "請輸入有效的商品放售售價";
  }

  if (
    input.sellerDescription &&
    input.sellerDescription.length > LISTING_DESCRIPTION_MAX
  ) {
    return `品相描述不可超過 ${LISTING_DESCRIPTION_MAX} 字`;
  }

  return null;
}

export function validateCreateSealedListing(
  input: CreateSealedListingFields,
  imageFiles: File[],
): string | null {
  const fieldError = validateCreateSealedListingFields(input);
  if (fieldError) return fieldError;

  return validateSealedListingImageFiles(imageFiles);
}

export type UpdateCardListingFields = {
  listingId: string;
  gradingOptionId: string;
  price: number;
  sellerDescription?: string;
};

export function validateUpdateListingImageCount(
  count: number,
  itemKind: "card" | "box_set",
): string | null {
  return itemKind === "box_set"
    ? validateSealedListingImageCount(count)
    : validateListingImageCount(count);
}

export function validateUpdateCardListingFields(
  input: UpdateCardListingFields,
): string | null {
  if (!input.listingId.trim()) {
    return "無效的商品";
  }

  if (!isValidListingGradingOptionId(input.gradingOptionId)) {
    return "請選擇有效的鑑定／品相";
  }

  if (!Number.isFinite(input.price) || input.price <= 0) {
    return "請輸入有效的商品放售售價";
  }

  if (
    input.sellerDescription &&
    input.sellerDescription.length > LISTING_DESCRIPTION_MAX
  ) {
    return `品相描述不可超過 ${LISTING_DESCRIPTION_MAX} 字`;
  }

  return null;
}
