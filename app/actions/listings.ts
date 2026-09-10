"use server";

import { revalidatePath } from "next/cache";
import { revalidateHomeListingsCache } from "@/lib/home/revalidate-home-listings";
import {
  isCardCatalogType,
  isSealedCatalogType,
  isSealedProductGrade,
  normalizeSealedProductScore,
  parseSealState,
  sealedProductGradingFields,
  defaultSealedProductScore,
} from "@/lib/catalog/item-kind";
import type { CatalogType } from "@/lib/constants/commerce";
import {
  getGradingOption,
  gradingOptionToFields,
} from "@/lib/grading/options";
import { isMerchantListingAllowed } from "@/lib/kyc/merchant-gates";
import {
  parseShippingFeeInput,
  validateListingExtraShippingFee,
} from "@/lib/merchant/shipping-fee";
import { fetchReservedListingIds } from "@/lib/listings/inventory-reservation";
import { mapListingInsertError } from "@/lib/listings/errors";
import {
  parseImageUploadsFromFormData,
  validateImageUpload,
  type ParsedImageUpload,
} from "@/lib/listings/image-files";
import {
  parseListingImageObjects,
  toListingImages,
  type ListingImage,
} from "@/lib/listings/images";
import {
  LISTING_DESCRIPTION_MAX,
  validateCreateCardListingFields,
  validateCreateSealedListingFields,
  validateListingImageCount,
  validateSealedListingImageCount,
  validateUpdateCardListingFields,
} from "@/lib/listings/validation";
import {
  bunnyObjectKeyFromCdnUrl,
  deleteListingImagesFromBunny,
  isBunnyStorageConfigured,
  uploadListingImageToBunny,
} from "@/lib/storage/bunny";
import { enqueueOfferExpiredEmailsForListing } from "@/lib/notifications/offer-emails";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import { requireActiveAuthUser } from "@/lib/auth/mutation-guard";
import type { Tables, TablesInsert } from "@/types/supabase";

type ListingRow = Pick<
  Tables<"listings">,
  | "id"
  | "product_id"
  | "price"
  | "grading_company"
  | "grading_score"
  | "images"
  | "status"
>;

export type CreateCardListingResult =
  | { success: true; data: { listingId: string; images: ListingImage[] } }
  | { success: false; error: string };

export type PreUploadedListingImage = ListingImage & {
  objectKey: string;
};

async function assertListingModerationAllowed(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  persona: Tables<"listings">["seller_persona"],
): Promise<string | null> {
  type ListingModerationRpcClient = {
    rpc(
      fn: "moderation_check_listing_allowed",
      args: {
        p_user_id: string;
        p_persona: Tables<"listings">["seller_persona"];
      },
    ): Promise<{ data: boolean | null; error: { message: string } | null }>;
  };

  const { data, error } = await (
    supabase as unknown as ListingModerationRpcClient
  ).rpc("moderation_check_listing_allowed", {
    p_user_id: userId,
    p_persona: persona,
  });

  if (error) {
    console.error("[assertListingModerationAllowed]", error.message);
    return "無法驗證帳戶狀態，請稍後再試";
  }

  if (data === false) {
    return "帳戶已被限制上架";
  }

  return null;
}

function parsePreUploadedImages(raw: string): PreUploadedListingImage[] | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) return null;

    const images: PreUploadedListingImage[] = [];
    for (const item of parsed) {
      if (
        typeof item !== "object" ||
        item === null ||
        typeof (item as PreUploadedListingImage).url !== "string" ||
        typeof (item as PreUploadedListingImage).order !== "number" ||
        typeof (item as PreUploadedListingImage).objectKey !== "string"
      ) {
        return null;
      }

      images.push({
        url: (item as PreUploadedListingImage).url,
        order: (item as PreUploadedListingImage).order,
        objectKey: (item as PreUploadedListingImage).objectKey,
        remark: (item as PreUploadedListingImage).remark || undefined,
      });
    }

    return images;
  } catch {
    return null;
  }
}

type ListingSellerPersona = Tables<"listings">["seller_persona"];

function parseSellerPersonaField(
  raw: string,
): ListingSellerPersona | undefined {
  if (raw === "member" || raw === "merchant") {
    return raw;
  }
  return undefined;
}

function resolveListingSellerPersona(input: {
  requested?: ListingSellerPersona;
  sourceCollectionId?: string;
  profileRole: Tables<"profiles">["role"] | undefined;
}): { persona: ListingSellerPersona; error?: string } {
  if (input.sourceCollectionId) {
    return { persona: "member" };
  }

  const persona = input.requested ?? "member";

  if (persona === "merchant") {
    if (input.profileRole !== "merchant" && input.profileRole !== "admin") {
      return {
        persona: "member",
        error: "僅商戶帳號可建立商戶商品",
      };
    }
  }

  return { persona };
}

function resolveExtraShippingFeeForListing(
  sellerPersona: ListingSellerPersona | undefined,
  rawValue: unknown,
): { ok: true; amount: number } | { ok: false; error: string } {
  if (sellerPersona !== "merchant") {
    return { ok: true, amount: 0 };
  }

  const parsed = parseShippingFeeInput(rawValue);
  if (!parsed.ok) {
    return parsed;
  }

  const feeError = validateListingExtraShippingFee(parsed.amount);
  if (feeError) {
    return { ok: false, error: feeError };
  }

  return { ok: true, amount: parsed.amount };
}

function parseCreateCardListingForm(formData: FormData): {
  fields: {
    productId: string;
    gradingOptionId: string;
    price: number;
    sellerDescription?: string;
    useAuthentication: boolean;
    sourceCollectionId?: string;
    sellerPersona?: ListingSellerPersona;
    extraShippingFee: number;
  };
  uploads: ParsedImageUpload[];
  preUploaded: PreUploadedListingImage[] | null;
  rawImageEntryCount: number;
  extraShippingFeeError: string | null;
} {
  const productId = String(formData.get("productId") ?? "").trim();
  const gradingOptionId = String(formData.get("gradingOptionId") ?? "").trim();
  const price = Number(formData.get("price"));
  const sellerDescription = String(
    formData.get("sellerDescription") ?? "",
  )
    .trim()
    .slice(0, LISTING_DESCRIPTION_MAX);
  const useAuthenticationRaw = formData.get("useAuthentication");
  const useAuthentication =
    useAuthenticationRaw === null
      ? true
      : useAuthenticationRaw === "true" || useAuthenticationRaw === "on";
  const sourceCollectionIdRaw = String(
    formData.get("sourceCollectionId") ?? "",
  ).trim();
  const sourceCollectionId = sourceCollectionIdRaw || undefined;
  const sellerPersonaRaw = String(formData.get("sellerPersona") ?? "").trim();
  const sellerPersona = parseSellerPersonaField(sellerPersonaRaw);
  const extraShippingParsed = resolveExtraShippingFeeForListing(
    sellerPersona,
    formData.get("extraShippingFee"),
  );

  const rawImageEntries = formData.getAll("images");
  const uploads = parseImageUploadsFromFormData(formData);
  const uploadedImagesRaw = String(formData.get("uploadedImages") ?? "").trim();
  const preUploaded = uploadedImagesRaw
    ? parsePreUploadedImages(uploadedImagesRaw)
    : null;

  return {
    fields: {
      productId,
      gradingOptionId,
      price,
      sellerDescription: sellerDescription || undefined,
      useAuthentication,
      sourceCollectionId,
      sellerPersona,
      extraShippingFee: extraShippingParsed.ok ? extraShippingParsed.amount : 0,
    },
    uploads,
    preUploaded,
    rawImageEntryCount: rawImageEntries.length,
    extraShippingFeeError: extraShippingParsed.ok
      ? null
      : extraShippingParsed.error,
  };
}

function validateServerListingSubmit(
  fields: ReturnType<typeof parseCreateCardListingForm>["fields"],
  uploads: ParsedImageUpload[],
  preUploaded: PreUploadedListingImage[] | null,
  rawImageEntryCount: number,
  extraShippingFeeError?: string | null,
): string | null {
  if (extraShippingFeeError) {
    return extraShippingFeeError;
  }

  const fieldError = validateCreateCardListingFields(fields);
  if (fieldError) return fieldError;

  const imageCount = preUploaded?.length ?? uploads.length;
  const countError = validateListingImageCount(imageCount);
  if (countError) {
    if (preUploaded) return countError;
    if (rawImageEntryCount === 0) {
      return "圖片未能傳送到伺服器，請重試或壓縮相片後再上載";
    }
    if (rawImageEntryCount > 0 && uploads.length === 0) {
      return "圖片格式不支援，請使用 JPG、PNG、WEBP 或 HEIC";
    }
    return countError;
  }

  if (preUploaded) {
    return null;
  }

  for (const upload of uploads) {
    const error = validateImageUpload({
      size: upload.blob.size,
      type: upload.contentType,
      name: upload.name,
    });
    if (error) return error;
  }

  return null;
}

async function rollbackUploadedListingImages(objectKeys: string[]) {
  if (objectKeys.length === 0) return;
  await deleteListingImagesFromBunny(objectKeys);
}

function isUserListingObjectKey(userId: string, objectKey: string): boolean {
  const trimmed = objectKey.trim();
  if (!trimmed || trimmed.includes("..")) {
    return false;
  }
  return trimmed.startsWith(`listings/${userId}/`);
}

export type RollbackListingImagesResult =
  | { success: true }
  | { success: false; error: string };

/** Best-effort cleanup for client-pre-uploaded listing images (auth-scoped). */
export async function rollbackListingImages(
  objectKeys: string[],
): Promise<RollbackListingImagesResult> {
  if (objectKeys.length === 0) {
    return { success: true };
  }

  if (!isBunnyStorageConfigured()) {
    return { success: true };
  }

  try {
    const auth = await requireActiveAuthUser();
    if (!auth.ok) {
      return { success: false, error: auth.error };
    }
    const { user } = auth;

    const allowedKeys = objectKeys.filter((key) =>
      isUserListingObjectKey(user.id, key),
    );

    if (allowedKeys.length === 0) {
      return { success: false, error: "無效的圖片路徑" };
    }

    await deleteListingImagesFromBunny(allowedKeys);
    return { success: true };
  } catch (error) {
    console.error("[rollbackListingImages]", error);
    return { success: false, error: "無法清除已上載的圖片" };
  }
}

function parseUpdateCardListingForm(formData: FormData): {
  fields: {
    listingId: string;
    gradingOptionId: string;
    price: number;
    sellerDescription?: string;
    isActive: boolean;
    useAuthentication: boolean;
    sellerPersona?: ListingSellerPersona;
    extraShippingFee: number;
  };
  preUploaded: PreUploadedListingImage[] | null;
  extraShippingFeeError: string | null;
} {
  const listingId = String(formData.get("listingId") ?? "").trim();
  const gradingOptionId = String(formData.get("gradingOptionId") ?? "").trim();
  const price = Number(formData.get("price"));
  const sellerDescription = String(
    formData.get("sellerDescription") ?? "",
  )
    .trim()
    .slice(0, LISTING_DESCRIPTION_MAX);
  const isActiveRaw = formData.get("isActive");
  const isActive =
    isActiveRaw === null
      ? true
      : isActiveRaw === "true" || isActiveRaw === "on";
  const useAuthenticationRaw = formData.get("useAuthentication");
  const useAuthentication =
    useAuthenticationRaw === "true" || useAuthenticationRaw === "on";
  const sellerPersonaRaw = String(formData.get("sellerPersona") ?? "").trim();
  const sellerPersona =
    sellerPersonaRaw === "merchant" || sellerPersonaRaw === "member"
      ? sellerPersonaRaw
      : undefined;
  const extraShippingParsed = resolveExtraShippingFeeForListing(
    sellerPersona,
    formData.get("extraShippingFee"),
  );
  const uploadedImagesRaw = String(formData.get("uploadedImages") ?? "").trim();
  const preUploaded = uploadedImagesRaw
    ? parsePreUploadedImages(uploadedImagesRaw)
    : null;

  return {
    fields: {
      listingId,
      gradingOptionId,
      price,
      sellerDescription: sellerDescription || undefined,
      isActive,
      useAuthentication,
      sellerPersona,
      extraShippingFee: extraShippingParsed.ok ? extraShippingParsed.amount : 0,
    },
    preUploaded,
    extraShippingFeeError: extraShippingParsed.ok
      ? null
      : extraShippingParsed.error,
  };
}

function collectListingImageObjectKeys(
  userId: string,
  images: ListingImage[],
  preUploaded: PreUploadedListingImage[] | null,
): string[] {
  const keys = new Set<string>();

  if (preUploaded) {
    for (const image of preUploaded) {
      if (isUserListingObjectKey(userId, image.objectKey)) {
        keys.add(image.objectKey);
      }
    }
    return [...keys];
  }

  for (const image of images) {
    const key = bunnyObjectKeyFromCdnUrl(image.url);
    if (key && isUserListingObjectKey(userId, key)) {
      keys.add(key);
    }
  }

  return [...keys];
}

export type UpdateCardListingResult = CreateCardListingResult;

export async function updateCardListing(
  formData: FormData,
): Promise<UpdateCardListingResult> {
  const { fields, preUploaded, extraShippingFeeError } =
    parseUpdateCardListingForm(formData);

  if (extraShippingFeeError) {
    return { success: false, error: extraShippingFeeError };
  }

  const fieldError = validateUpdateCardListingFields({
    listingId: fields.listingId,
    gradingOptionId: fields.gradingOptionId,
    price: fields.price,
    sellerDescription: fields.sellerDescription,
  });

  const uploadedObjectKeys: string[] = preUploaded
    ? preUploaded.map((image) => image.objectKey)
    : [];

  const fail = async (error: string): Promise<UpdateCardListingResult> => {
    await rollbackUploadedListingImages(uploadedObjectKeys);
    return { success: false, error };
  };

  if (fieldError) {
    return fail(fieldError);
  }

  if (formData.get("uploadedImages") && !preUploaded) {
    return fail("上載的圖片資料無效，請重新上載相片");
  }

  try {
    const auth = await requireActiveAuthUser();
    if (!auth.ok) {
      return fail(auth.error);
    }
    const { user, supabase } = auth;

    const { data: existingListing, error: fetchError } = await supabase
      .from("listings")
      .select(
        "id, seller_id, status, images, grading_company, grading_score, use_authentication, seller_persona",
      )
      .eq("id", fields.listingId)
      .maybeSingle<
        Pick<
          Tables<"listings">,
          | "id"
          | "seller_id"
          | "status"
          | "images"
          | "grading_company"
          | "grading_score"
          | "use_authentication"
          | "seller_persona"
        >
      >();

    if (fetchError || !existingListing) {
      return fail("找不到要更新的商品");
    }

    const imageCount = preUploaded?.length ?? 0;
    const isSealedListing = isSealedProductGrade(
      existingListing.grading_company,
      existingListing.grading_score,
    );
    const countError = isSealedListing
      ? validateSealedListingImageCount(imageCount)
      : validateListingImageCount(imageCount);
    if (countError) {
      return fail(countError);
    }

    if (existingListing.seller_id !== user.id) {
      return fail("沒有權限更新此商品");
    }

    const moderationError = await assertListingModerationAllowed(
      supabase,
      user.id,
      existingListing.seller_persona,
    );
    if (moderationError) {
      return fail(moderationError);
    }

    if (existingListing.status === "sold") {
      return fail("已售出的商品無法編輯");
    }

    const reservedListingIds = await fetchReservedListingIds(
      supabase,
      user.id,
      [fields.listingId],
    );
    if (reservedListingIds.has(fields.listingId)) {
      return fail("此商品有進行中訂單，暫時無法編輯");
    }

    if (!isBunnyStorageConfigured()) {
      return fail("圖片儲存服務尚未設定，請稍後再試");
    }

    let gradingCompany: string;
    let gradingScore: string | null;
    let useAuthentication: boolean;

    if (isSealedListing) {
      const sealFromField = fields.gradingOptionId.startsWith("sealed:")
        ? parseSealState(fields.gradingOptionId.slice("sealed:".length))
        : null;
      const sealedFields = sealedProductGradingFields(
        sealFromField ??
          normalizeSealedProductScore(
            existingListing.grading_company,
            existingListing.grading_score,
          ),
      );
      gradingCompany = sealedFields.gradingCompany;
      gradingScore = sealedFields.gradingScore;
      useAuthentication = false;
    } else {
      const grading = gradingOptionToFields(
        getGradingOption(fields.gradingOptionId),
      );
      gradingCompany = grading.grader;
      gradingScore =
        grading.grader === "RAW" ? grading.condition : grading.gradeScore;
      useAuthentication =
        grading.grader === "RAW" ? fields.useAuthentication : false;
    }

    const images: ListingImage[] = preUploaded!.map(
      ({ url, order, remark }) => ({
        url,
        order,
        remark,
      }),
    );

    const previousKeys = collectListingImageObjectKeys(
      user.id,
      parseListingImageObjects(existingListing.images),
      null,
    );
    const nextKeys = new Set(
      collectListingImageObjectKeys(user.id, images, preUploaded),
    );
    const replacedKeys = previousKeys.filter((key) => !nextKeys.has(key));

    const sellerPersona = existingListing.seller_persona;
    const extraShippingFee =
      sellerPersona === "merchant" ? fields.extraShippingFee : 0;

    const admin = createAdminClient();
    const { data: listing, error: updateError } = await admin
      .from("listings")
      .update({
        price: fields.price,
        grading_company: gradingCompany,
        grading_score: gradingScore,
        images,
        seller_description: fields.sellerDescription ?? null,
        status: fields.isActive ? "active" : "inactive",
        use_authentication: useAuthentication,
        extra_shipping_fee: extraShippingFee,
      })
      .eq("id", fields.listingId)
      .eq("seller_id", user.id)
      .select("id, product_id, price, grading_company, grading_score, images, status")
      .single<ListingRow>();

    if (updateError || !listing) {
      console.error("[updateCardListing]", {
        code: updateError?.code,
        message: updateError?.message,
        details: updateError?.details,
        hint: updateError?.hint,
      });
      return fail(mapListingInsertError(updateError));
    }

    if (replacedKeys.length > 0) {
      await deleteListingImagesFromBunny(replacedKeys);
    }

    if (existingListing.status === "active" && !fields.isActive) {
      await enqueueOfferExpiredEmailsForListing({
        listingId: fields.listingId,
        reason: "listing_inactive",
      });
    }

    revalidatePath("/marketplace");
    revalidateHomeListingsCache();
    revalidatePath("/profile/user/inventory");
    revalidatePath("/profile/merchant/inventory");

    return {
      success: true,
      data: {
        listingId: listing.id,
        images,
      },
    };
  } catch (error) {
    console.error("[updateCardListing]", error);
    await rollbackUploadedListingImages(uploadedObjectKeys);

    if (error instanceof Error && error.message.includes("Bunny")) {
      return { success: false, error: "圖片上載失敗，請稍後再試" };
    }

    return { success: false, error: "商品更新時發生錯誤" };
  }
}

export async function createCardListing(
  formData: FormData,
): Promise<CreateCardListingResult> {
  const { fields, uploads, preUploaded, rawImageEntryCount, extraShippingFeeError } =
    parseCreateCardListingForm(formData);

  const uploadedObjectKeys: string[] = preUploaded
    ? preUploaded.map((image) => image.objectKey)
    : [];

  const fail = async (error: string): Promise<CreateCardListingResult> => {
    await rollbackUploadedListingImages(uploadedObjectKeys);
    return { success: false, error };
  };

  if (formData.get("uploadedImages") && !preUploaded) {
    return fail("上載的圖片資料無效，請重新上載相片");
  }

  const validationError = validateServerListingSubmit(
    fields,
    uploads,
    preUploaded,
    rawImageEntryCount,
    extraShippingFeeError,
  );

  if (validationError) {
    return fail(validationError);
  }

  try {
    const auth = await requireActiveAuthUser();
    if (!auth.ok) {
      return fail(auth.error);
    }
    const { user, supabase } = auth;

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("id, role")
      .eq("id", user.id)
      .maybeSingle<Pick<Tables<"profiles">, "id" | "role">>();

    if (profileError || !profile) {
      return fail("無法驗證賣家身份");
    }

    const { persona: sellerPersona, error: personaError } =
      resolveListingSellerPersona({
        requested: fields.sellerPersona,
        sourceCollectionId: fields.sourceCollectionId,
        profileRole: profile.role,
      });

    if (personaError) {
      return fail(personaError);
    }

    const moderationError = await assertListingModerationAllowed(
      supabase,
      user.id,
      sellerPersona,
    );
    if (moderationError) {
      return fail(moderationError);
    }

    if (sellerPersona === "merchant" && profile.role !== "admin") {
      const [{ data: shopRow, error: shopError }, { data: kycRow, error: kycError }] =
        await Promise.all([
          supabase
            .from("merchant_shops")
            .select("merchant_id")
            .eq("merchant_id", user.id)
            .maybeSingle<Pick<Tables<"merchant_shops">, "merchant_id">>(),
          supabase
            .from("kyc_records")
            .select("kyc_status")
            .eq("merchant_id", user.id)
            .maybeSingle<Pick<Tables<"kyc_records">, "kyc_status">>(),
        ]);

      if (shopError || !shopRow) {
        return fail("商戶店舖資料尚未就緒，無法建立商戶商品");
      }

      if (kycError) {
        console.error("[createListing] kyc_records", kycError.message);
        return fail("無法驗證商戶認證狀態，請稍後再試");
      }

      if (!isMerchantListingAllowed(kycRow?.kyc_status)) {
        return fail("商戶認證審核中，暫不可上架商品");
      }
    }

    const { data: catalogRow, error: catalogError } = await supabase
      .from("product_catalog")
      .select("id, type")
      .eq("id", fields.productId)
      .maybeSingle<{ id: string; type: CatalogType }>();

    if (catalogError || !catalogRow) {
      return fail("所選卡牌不存在於商品目錄");
    }

    if (!isCardCatalogType(catalogRow.type)) {
      return fail("請使用盒組商品上架流程");
    }

    if (!isBunnyStorageConfigured()) {
      return fail("圖片儲存服務尚未設定，請稍後再試");
    }

    const grading = gradingOptionToFields(
      getGradingOption(fields.gradingOptionId),
    );

    let images: ListingImage[];
    if (preUploaded) {
      images = preUploaded.map(({ url, order, remark }) => ({ url, order, remark }));
    } else {
      const uploadedUrls: string[] = [];
      for (const upload of uploads) {
        const bytes = new Uint8Array(await upload.blob.arrayBuffer());
        const bunnyUpload = await uploadListingImageToBunny(
          user.id,
          bytes,
          upload.contentType,
        );
        uploadedObjectKeys.push(bunnyUpload.objectKey);
        uploadedUrls.push(bunnyUpload.cdnUrl);
      }

      images = toListingImages(uploadedUrls);
    }

    const admin = createAdminClient();
    const insertPayload: TablesInsert<"listings"> = {
      product_id: fields.productId,
      seller_id: user.id,
      price: fields.price,
      grading_company: grading.grader,
      grading_score:
        grading.grader === "RAW" ? grading.condition : grading.gradeScore,
      images,
      seller_description: fields.sellerDescription ?? null,
      status: "active",
      seller_persona: sellerPersona,
      use_authentication: fields.useAuthentication,
      extra_shipping_fee:
        sellerPersona === "merchant" ? fields.extraShippingFee : 0,
    };

    if (fields.sourceCollectionId) {
      const { data: collectionRow, error: collectionError } = await supabase
        .from("user_collections")
        .select("id")
        .eq("id", fields.sourceCollectionId)
        .eq("user_id", user.id)
        .is("sold_at", null)
        .maybeSingle<{ id: string }>();

      if (collectionError || !collectionRow) {
        return fail("無法連結收藏庫項目，請重新從收藏庫發起出售");
      }

      insertPayload.source_collection_id = collectionRow.id;
    }

    const { data: listing, error: insertError } = await admin
      .from("listings")
      .insert(insertPayload)
      .select("id, product_id, price, grading_company, grading_score, images, status")
      .single<ListingRow>();

    if (insertError || !listing) {
      console.error("[createCardListing]", {
        code: insertError?.code,
        message: insertError?.message,
        details: insertError?.details,
        hint: insertError?.hint,
      });
      return fail(mapListingInsertError(insertError));
    }

    revalidatePath("/marketplace");
    revalidateHomeListingsCache();
    revalidatePath("/profile/user/collection");
    revalidatePath("/profile/user/inventory");
    revalidatePath("/profile/merchant/inventory");

    return {
      success: true,
      data: {
        listingId: listing.id,
        images,
      },
    };
  } catch (error) {
    console.error("[createCardListing]", error);
    await rollbackUploadedListingImages(uploadedObjectKeys);

    if (error instanceof Error && error.message.includes("Bunny")) {
      return { success: false, error: "圖片上載失敗，請稍後再試" };
    }

    return { success: false, error: "商品上架時發生錯誤" };
  }
}

function parseCreateSealedListingForm(formData: FormData): {
  fields: {
    productId: string;
    price: number;
    sealState: ReturnType<typeof defaultSealedProductScore>;
    sellerDescription?: string;
    sourceCollectionId?: string;
    sellerPersona?: ListingSellerPersona;
    extraShippingFee: number;
  };
  uploads: ParsedImageUpload[];
  preUploaded: PreUploadedListingImage[] | null;
  rawImageEntryCount: number;
  extraShippingFeeError: string | null;
} {
  const productId = String(formData.get("productId") ?? "").trim();
  const price = Number(formData.get("price"));
  const sealStateRaw = String(formData.get("sealState") ?? "").trim();
  const sealState =
    parseSealState(sealStateRaw) ?? defaultSealedProductScore();
  const sellerDescription = String(
    formData.get("sellerDescription") ?? "",
  )
    .trim()
    .slice(0, LISTING_DESCRIPTION_MAX);
  const sourceCollectionIdRaw = String(
    formData.get("sourceCollectionId") ?? "",
  ).trim();
  const sourceCollectionId = sourceCollectionIdRaw || undefined;
  const sellerPersonaRaw = String(formData.get("sellerPersona") ?? "").trim();
  const sellerPersona = parseSellerPersonaField(sellerPersonaRaw);
  const extraShippingParsed = resolveExtraShippingFeeForListing(
    sellerPersona,
    formData.get("extraShippingFee"),
  );

  const rawImageEntries = formData.getAll("images");
  const uploads = parseImageUploadsFromFormData(formData);
  const uploadedImagesRaw = String(formData.get("uploadedImages") ?? "").trim();
  const preUploaded = uploadedImagesRaw
    ? parsePreUploadedImages(uploadedImagesRaw)
    : null;

  return {
    fields: {
      productId,
      price,
      sealState,
      sellerDescription: sellerDescription || undefined,
      sourceCollectionId,
      sellerPersona,
      extraShippingFee: extraShippingParsed.ok ? extraShippingParsed.amount : 0,
    },
    uploads,
    preUploaded,
    rawImageEntryCount: rawImageEntries.length,
    extraShippingFeeError: extraShippingParsed.ok
      ? null
      : extraShippingParsed.error,
  };
}

function validateServerSealedListingSubmit(
  fields: ReturnType<typeof parseCreateSealedListingForm>["fields"],
  uploads: ParsedImageUpload[],
  preUploaded: PreUploadedListingImage[] | null,
  rawImageEntryCount: number,
  extraShippingFeeError?: string | null,
): string | null {
  if (extraShippingFeeError) {
    return extraShippingFeeError;
  }

  const fieldError = validateCreateSealedListingFields(fields);
  if (fieldError) return fieldError;

  const imageCount = preUploaded?.length ?? uploads.length;
  const countError = validateSealedListingImageCount(imageCount);
  if (countError) {
    if (preUploaded) return countError;
    if (rawImageEntryCount === 0) {
      return "圖片未能傳送到伺服器，請重試或壓縮相片後再上載";
    }
    if (rawImageEntryCount > 0 && uploads.length === 0) {
      return "圖片格式不支援，請使用 JPG、PNG、WEBP 或 HEIC";
    }
    return countError;
  }

  if (preUploaded) {
    return null;
  }

  for (const upload of uploads) {
    const error = validateImageUpload({
      size: upload.blob.size,
      type: upload.contentType,
      name: upload.name,
    });
    if (error) return error;
  }

  return null;
}

export async function createSealedListing(
  formData: FormData,
): Promise<CreateCardListingResult> {
  const { fields, uploads, preUploaded, rawImageEntryCount, extraShippingFeeError } =
    parseCreateSealedListingForm(formData);

  const uploadedObjectKeys: string[] = preUploaded
    ? preUploaded.map((image) => image.objectKey)
    : [];

  const fail = async (error: string): Promise<CreateCardListingResult> => {
    await rollbackUploadedListingImages(uploadedObjectKeys);
    return { success: false, error };
  };

  if (formData.get("uploadedImages") && !preUploaded) {
    return fail("上載的圖片資料無效，請重新上載相片");
  }

  const validationError = validateServerSealedListingSubmit(
    fields,
    uploads,
    preUploaded,
    rawImageEntryCount,
    extraShippingFeeError,
  );

  if (validationError) {
    return fail(validationError);
  }

  try {
    const auth = await requireActiveAuthUser();
    if (!auth.ok) {
      return fail(auth.error);
    }
    const { user, supabase } = auth;

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("id, role")
      .eq("id", user.id)
      .maybeSingle<Pick<Tables<"profiles">, "id" | "role">>();

    if (profileError || !profile) {
      return fail("無法驗證賣家身份");
    }

    const { persona: sellerPersona, error: personaError } =
      resolveListingSellerPersona({
        requested: fields.sellerPersona,
        sourceCollectionId: fields.sourceCollectionId,
        profileRole: profile.role,
      });

    if (personaError) {
      return fail(personaError);
    }

    const moderationError = await assertListingModerationAllowed(
      supabase,
      user.id,
      sellerPersona,
    );
    if (moderationError) {
      return fail(moderationError);
    }

    if (sellerPersona === "merchant" && profile.role !== "admin") {
      const [{ data: shopRow, error: shopError }, { data: kycRow, error: kycError }] =
        await Promise.all([
          supabase
            .from("merchant_shops")
            .select("merchant_id")
            .eq("merchant_id", user.id)
            .maybeSingle<Pick<Tables<"merchant_shops">, "merchant_id">>(),
          supabase
            .from("kyc_records")
            .select("kyc_status")
            .eq("merchant_id", user.id)
            .maybeSingle<Pick<Tables<"kyc_records">, "kyc_status">>(),
        ]);

      if (shopError || !shopRow) {
        return fail("商戶店舖資料尚未就緒，無法建立商戶商品");
      }

      if (kycError) {
        console.error("[createListing] kyc_records", kycError.message);
        return fail("無法驗證商戶認證狀態，請稍後再試");
      }

      if (!isMerchantListingAllowed(kycRow?.kyc_status)) {
        return fail("商戶認證審核中，暫不可上架商品");
      }
    }

    const { data: catalogRow, error: catalogError } = await supabase
      .from("product_catalog")
      .select("id, type")
      .eq("id", fields.productId)
      .maybeSingle<{ id: string; type: CatalogType }>();

    if (catalogError || !catalogRow) {
      return fail("所選商品不存在於商品目錄");
    }

    if (!isSealedCatalogType(catalogRow.type)) {
      return fail("所選商品並非密封盒組類型");
    }

    if (!isBunnyStorageConfigured()) {
      return fail("圖片儲存服務尚未設定，請稍後再試");
    }

    let images: ListingImage[];
    if (preUploaded) {
      images = preUploaded.map(({ url, order, remark }) => ({ url, order, remark }));
    } else {
      const uploadedUrls: string[] = [];
      for (const upload of uploads) {
        const bytes = new Uint8Array(await upload.blob.arrayBuffer());
        const bunnyUpload = await uploadListingImageToBunny(
          user.id,
          bytes,
          upload.contentType,
        );
        uploadedObjectKeys.push(bunnyUpload.objectKey);
        uploadedUrls.push(bunnyUpload.cdnUrl);
      }

      images = toListingImages(uploadedUrls);
    }

    const admin = createAdminClient();
    const sealedGrading = sealedProductGradingFields(fields.sealState);
    const insertPayload: TablesInsert<"listings"> = {
      product_id: fields.productId,
      seller_id: user.id,
      price: fields.price,
      grading_company: sealedGrading.gradingCompany,
      grading_score: sealedGrading.gradingScore,
      images,
      seller_description: fields.sellerDescription ?? null,
      status: "active",
      seller_persona: sellerPersona,
      use_authentication: false,
      extra_shipping_fee:
        sellerPersona === "merchant" ? fields.extraShippingFee : 0,
    };

    if (fields.sourceCollectionId) {
      const { data: collectionRow, error: collectionError } = await supabase
        .from("user_collections")
        .select("id")
        .eq("id", fields.sourceCollectionId)
        .eq("user_id", user.id)
        .is("sold_at", null)
        .maybeSingle<{ id: string }>();

      if (collectionError || !collectionRow) {
        return fail("無法連結收藏庫項目，請重新從收藏庫發起出售");
      }

      insertPayload.source_collection_id = collectionRow.id;
    }

    const { data: listing, error: insertError } = await admin
      .from("listings")
      .insert(insertPayload)
      .select("id, product_id, price, grading_company, grading_score, images, status")
      .single<ListingRow>();

    if (insertError || !listing) {
      console.error("[createSealedListing]", {
        code: insertError?.code,
        message: insertError?.message,
        details: insertError?.details,
        hint: insertError?.hint,
      });
      return fail(mapListingInsertError(insertError));
    }

    revalidatePath("/marketplace");
    revalidateHomeListingsCache();
    revalidatePath("/profile/user/collection");
    revalidatePath("/profile/user/inventory");
    revalidatePath("/profile/merchant/inventory");

    return {
      success: true,
      data: {
        listingId: listing.id,
        images,
      },
    };
  } catch (error) {
    console.error("[createSealedListing]", error);
    await rollbackUploadedListingImages(uploadedObjectKeys);

    if (error instanceof Error && error.message.includes("Bunny")) {
      return { success: false, error: "圖片上載失敗，請稍後再試" };
    }

    return { success: false, error: "商品上架時發生錯誤" };
  }
}

export type IncrementListingViewResult =
  | { success: true }
  | { success: false; error: string };

export async function incrementListingView(
  listingId: string,
): Promise<IncrementListingViewResult> {
  if (!isSupabaseConfigured()) {
    return { success: false, error: "服務尚未設定" };
  }

  const trimmedId = listingId.trim();
  if (!trimmedId) {
    return { success: false, error: "無效的掛單" };
  }

  try {
    const supabase = await createClient();

    const { error } = await (
      supabase as unknown as {
        rpc: (
          fn: "rpc_increment_listing_view",
          args: { p_listing_id: string },
        ) => Promise<{
          data: unknown;
          error: { message: string } | null;
        }>;
      }
    ).rpc("rpc_increment_listing_view", {
      p_listing_id: trimmedId,
    });

    if (error) {
      console.error("[incrementListingView]", error.message);
      return { success: false, error: "無法更新瀏覽次數" };
    }

    return { success: true };
  } catch (error) {
    console.error("[incrementListingView]", error);
    return { success: false, error: "無法更新瀏覽次數" };
  }
}
