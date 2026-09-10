"use client";

import {
  createSealedListing,
  rollbackListingImages,
  type CreateCardListingResult,
} from "@/app/actions/listings";
import { defaultSealedProductScore } from "@/lib/catalog/item-kind";
import { useListingSubmitStore } from "@/app/store/useListingSubmitStore";
import {
  uploadListingImageWithProgress,
  type ClientUploadedListingImage,
} from "@/lib/listings/client-upload";
import { validateCreateSealedListing } from "@/lib/listings/validation";

export type SubmitSealedListingInput = {
  productId: string;
  price: number;
  extraShippingFee?: number;
  sellerDescription?: string;
  sourceCollectionId?: string;
  sellerPersona?: "member" | "merchant";
  imageFiles: File[];
  photosRemark?: string[];
  sealState?: import("@/lib/catalog/item-kind").SealedProductScore;
};

async function rollbackClientUploadedImages(
  uploadedImages: ClientUploadedListingImage[],
) {
  if (uploadedImages.length === 0) {
    return;
  }

  const objectKeys = uploadedImages.map((image) => image.objectKey);
  const result = await rollbackListingImages(objectKeys);
  if (!result.success) {
    console.error("[submitSealedListingWithProgress] rollback failed:", result.error);
  }
}

export async function submitSealedListingWithProgress(
  input: SubmitSealedListingInput,
): Promise<CreateCardListingResult> {
  const {
    startSubmit,
    setPhase,
    setUploadProgress,
    finishSuccess,
    finishError,
  } = useListingSubmitStore.getState();

  const totalUploads = input.imageFiles.length;
  const uploadedImages: ClientUploadedListingImage[] = [];

  startSubmit("create", Math.max(totalUploads, 1));

  try {
    setPhase("validating", "驗證上架資料…", 6);

    const validationError = validateCreateSealedListing(
      {
        productId: input.productId,
        price: input.price,
        sellerDescription: input.sellerDescription,
      },
      input.imageFiles,
    );

    if (validationError) {
      finishError(validationError);
      return { success: false, error: validationError };
    }

    for (let index = 0; index < input.imageFiles.length; index += 1) {
      const file = input.imageFiles[index]!;
      const imageIndex = index + 1;

      setUploadProgress(imageIndex, 0, totalUploads);

      const bunnyUpload = await uploadListingImageWithProgress(file, (percent) => {
        setUploadProgress(imageIndex, percent, totalUploads);
      });

      uploadedImages.push({
        url: bunnyUpload.cdnUrl,
        order: imageIndex,
        objectKey: bunnyUpload.objectKey,
        remark: input.photosRemark?.[index] || undefined,
      });
    }

    setPhase("saving", "寫入商品資料…", 92);

    const formData = new FormData();
    formData.append("productId", input.productId);
    formData.append("price", String(input.price));
    if (input.extraShippingFee != null && input.extraShippingFee > 0) {
      formData.append("extraShippingFee", String(input.extraShippingFee));
    }
    if (input.sellerDescription?.trim()) {
      formData.append("sellerDescription", input.sellerDescription.trim());
    }
    formData.append("uploadedImages", JSON.stringify(uploadedImages));
    if (input.sourceCollectionId) {
      formData.append("sourceCollectionId", input.sourceCollectionId);
    }
    if (input.sellerPersona) {
      formData.append("sellerPersona", input.sellerPersona);
    }
    formData.append("sealState", input.sealState ?? defaultSealedProductScore());

    const result = await createSealedListing(formData);

    if (!result.success) {
      finishError(result.error);
      return result;
    }

    finishSuccess("商品已成功上架！");
    return result;
  } catch (error) {
    await rollbackClientUploadedImages(uploadedImages);
    const message =
      error instanceof Error ? error.message : "商品上架時發生錯誤";
    finishError(message);
    return { success: false, error: message };
  }
}
