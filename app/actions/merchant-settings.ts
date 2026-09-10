"use server";

import { revalidatePath } from "next/cache";
import { mapMerchantShopFetchError, mapMerchantShopUpdateError } from "@/lib/merchant/errors";
import {
  parseShippingFeeInput,
  PLATFORM_DEFAULT_COURIER_SHIPPING_FEE,
} from "@/lib/merchant/shipping-fee";
import {
  validateMerchantShopFields,
  type MerchantShopFormErrors,
} from "@/lib/merchant/validation";
import { resolveAvatarUrl, resolveOptionalMediaUrl } from "@/lib/profile/avatar";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import {
  bunnyObjectKeyFromCdnUrl,
  deleteProfileAvatarFromBunny,
  isAllowedBunnyCdnUrl,
} from "@/lib/storage/bunny";
import type { Database, Tables } from "@/types/supabase";

type MerchantRoleRow = Pick<Tables<"profiles">, "role">;

type MerchantShopSettingsRow = Pick<
  Tables<"merchant_shops">,
  | "merchant_id"
  | "shop_name"
  | "shop_handle"
  | "shop_description"
  | "shop_avatar_path"
  | "top_banner_path"
  | "base_courier_shipping_fee"
>;

type MerchantShopUpdate =
  Database["public"]["Tables"]["merchant_shops"]["Update"];

export type MerchantSettingsData = {
  merchantId: string;
  shopName: string;
  shopHandle: string;
  shopDescription: string;
  baseCourierShippingFee: number;
  shopAvatarUrl: string;
  topBannerUrl: string | null;
  email: string;
};

async function ensureMerchantShopRow(
  supabase: Awaited<ReturnType<typeof createClient>>,
  merchantId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: existing, error: fetchError } = await supabase
    .from("merchant_shops")
    .select("merchant_id")
    .eq("merchant_id", merchantId)
    .maybeSingle<Pick<MerchantShopSettingsRow, "merchant_id">>();

  if (fetchError) {
    console.error("[ensureMerchantShopRow]", fetchError.message);
    return { ok: false, error: mapMerchantShopFetchError(fetchError) };
  }

  if (existing) {
    return { ok: true };
  }

  const { error: insertError } = await (
    supabase.from("merchant_shops") as unknown as {
      insert: (values: Database["public"]["Tables"]["merchant_shops"]["Insert"]) => Promise<{
        error: { message?: string } | null;
      }>;
    }
  ).insert({
    merchant_id: merchantId,
    shop_name: "新認證商戶",
    shop_description: "",
    completed_trades_count: 0,
    rating_score: 5.0,
    shop_rating_score: 5.0,
  });

  if (insertError) {
    console.error("[ensureMerchantShopRow]", insertError.message);
    return { ok: false, error: "店舖尚未初始化，請完成商戶認證" };
  }

  return { ok: true };
}

export async function getMerchantSettings(): Promise<
  { success: true; data: MerchantSettingsData } | { success: false; error: string }
> {
  if (!isSupabaseConfigured()) {
    return { success: false, error: "未登入" };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: "未登入" };
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle<MerchantRoleRow>();

  if (profileError || !profile) {
    return { success: false, error: "無法取得用戶資料" };
  }

  if (profile.role !== "merchant") {
    return { success: false, error: "無商戶權限" };
  }

  const ensured = await ensureMerchantShopRow(supabase, user.id);
  if (!ensured.ok) {
    return { success: false, error: ensured.error };
  }

  const { data: shop, error: shopError } = await supabase
    .from("merchant_shops")
    .select(
      "merchant_id, shop_name, shop_handle, shop_description, shop_avatar_path, top_banner_path, base_courier_shipping_fee",
    )
    .eq("merchant_id", user.id)
    .maybeSingle<MerchantShopSettingsRow>();

  if (shopError) {
    console.error("[getMerchantSettings]", shopError.message);
    return { success: false, error: mapMerchantShopFetchError(shopError) };
  }

  if (!shop) {
    return { success: false, error: "店舖尚未初始化，請完成商戶認證" };
  }

  return {
    success: true,
    data: {
      merchantId: shop.merchant_id,
      shopName: shop.shop_name?.trim() ?? "",
      shopHandle: shop.shop_handle?.trim() ?? "",
      shopDescription: shop.shop_description?.trim() ?? "",
      baseCourierShippingFee: Number(
        shop.base_courier_shipping_fee ?? PLATFORM_DEFAULT_COURIER_SHIPPING_FEE,
      ),
      shopAvatarUrl: resolveAvatarUrl(shop.shop_avatar_path),
      topBannerUrl: resolveOptionalMediaUrl(shop.top_banner_path),
      email: user.email ?? "",
    },
  };
}

async function isShopHandleTakenByOther(
  shopHandle: string,
  merchantId: string,
): Promise<boolean> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("merchant_shops")
    .select("merchant_id")
    .ilike("shop_handle", shopHandle.trim())
    .neq("merchant_id", merchantId)
    .limit(1);

  if (error) throw error;
  return (data?.length ?? 0) > 0;
}

export async function updateMerchantShopProfile(
  _prev: MerchantShopFormErrors | null,
  formData: FormData,
): Promise<MerchantShopFormErrors | null> {
  const fields = {
    shopName: ((formData.get("shopName") as string | null) ?? "").trim(),
    shopHandle: ((formData.get("shopHandle") as string | null) ?? "").trim(),
    shopDescription: (
      (formData.get("shopDescription") as string | null) ?? ""
    ).trim(),
    baseCourierShippingFee: (
      (formData.get("baseCourierShippingFee") as string | null) ?? ""
    ).trim(),
  };

  const errors = validateMerchantShopFields(fields);
  if (Object.keys(errors).length) return errors;

  if (!isSupabaseConfigured()) {
    return { form: "未登入" };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { form: "未登入" };
  }

  try {
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle<MerchantRoleRow>();

    if (profileError || !profile) {
      return { form: "無法取得用戶資料" };
    }

    if (profile.role !== "merchant") {
      return { form: "無商戶權限" };
    }

    const ensured = await ensureMerchantShopRow(supabase, user.id);
    if (!ensured.ok) {
      return { form: ensured.error };
    }

    const { data: currentShop, error: fetchError } = await supabase
      .from("merchant_shops")
      .select("shop_handle")
      .eq("merchant_id", user.id)
      .maybeSingle<Pick<MerchantShopSettingsRow, "shop_handle">>();

    if (fetchError) {
      return { form: mapMerchantShopFetchError(fetchError) };
    }

    if (!currentShop) {
      return { form: "店舖尚未初始化，請完成商戶認證" };
    }

    const normalizedHandle = fields.shopHandle || null;
    const currentHandle = currentShop.shop_handle?.trim() ?? "";

    if (
      normalizedHandle &&
      normalizedHandle.toLowerCase() !== currentHandle.toLowerCase()
    ) {
      const handleTaken = await isShopHandleTakenByOther(
        normalizedHandle,
        user.id,
      );
      if (handleTaken) {
        return { shopHandle: "此店舖帳號已被使用" };
      }
    }

    const parsedBaseFee = parseShippingFeeInput(fields.baseCourierShippingFee);
    if (!parsedBaseFee.ok) {
      return { baseCourierShippingFee: parsedBaseFee.error };
    }

    const payload: MerchantShopUpdate = {
      shop_name: fields.shopName,
      shop_handle: normalizedHandle,
      shop_description: fields.shopDescription || null,
      base_courier_shipping_fee: parsedBaseFee.amount,
      updated_at: new Date().toISOString(),
    };

    const shopsClient = supabase.from("merchant_shops") as unknown as {
      update: (values: MerchantShopUpdate) => {
        eq: (
          column: "merchant_id",
          value: string,
        ) => {
          select: (columns: "merchant_id") => Promise<{
            data: { merchant_id: string }[] | null;
            error: { code?: string; message?: string } | null;
          }>;
        };
      };
    };

    const { data: updatedRows, error: updateError } = await shopsClient
      .update(payload)
      .eq("merchant_id", user.id)
      .select("merchant_id");

    if (updateError) {
      return mapMerchantShopUpdateError(updateError);
    }

    if (!updatedRows?.length) {
      return {
        form: "沒有權限更新資料，請確認已套用 merchant_shops UPDATE migration",
      };
    }
  } catch {
    return { form: "儲存失敗，請稍後再試" };
  }

  revalidatePath("/profile/merchant/settings");
  revalidatePath("/profile/merchant");
  revalidatePath(`/profile/${user.id}`);
  revalidatePath("/marketplace/[id]", "page");

  return null;
}

export async function updateMerchantShopAvatar(
  cdnUrl: string,
): Promise<{ success: true } | { success: false; error: string }> {
  if (!isSupabaseConfigured()) {
    return { success: false, error: "未登入" };
  }

  const trimmedUrl = cdnUrl.trim();
  if (!trimmedUrl || !isAllowedBunnyCdnUrl(trimmedUrl)) {
    return { success: false, error: "店舖頭像網址無效" };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: "未登入" };
  }

  try {
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle<MerchantRoleRow>();

    if (profileError || !profile) {
      return { success: false, error: "無法取得用戶資料" };
    }

    if (profile.role !== "merchant") {
      return { success: false, error: "無商戶權限" };
    }

    const ensured = await ensureMerchantShopRow(supabase, user.id);
    if (!ensured.ok) {
      return { success: false, error: ensured.error };
    }

    const { data: currentShop, error: fetchError } = await supabase
      .from("merchant_shops")
      .select("shop_avatar_path")
      .eq("merchant_id", user.id)
      .maybeSingle<Pick<MerchantShopSettingsRow, "shop_avatar_path">>();

    if (fetchError) {
      return { success: false, error: mapMerchantShopFetchError(fetchError) };
    }

    if (!currentShop) {
      return { success: false, error: "店舖尚未初始化，請完成商戶認證" };
    }

    const payload: MerchantShopUpdate = {
      shop_avatar_path: trimmedUrl,
      updated_at: new Date().toISOString(),
    };

    const shopsClient = supabase.from("merchant_shops") as unknown as {
      update: (values: MerchantShopUpdate) => {
        eq: (
          column: "merchant_id",
          value: string,
        ) => {
          select: (columns: "merchant_id") => Promise<{
            data: { merchant_id: string }[] | null;
            error: { code?: string; message?: string } | null;
          }>;
        };
      };
    };

    const { data: updatedRows, error: updateError } = await shopsClient
      .update(payload)
      .eq("merchant_id", user.id)
      .select("merchant_id");

    if (updateError) {
      const mapped = mapMerchantShopUpdateError(updateError);
      return { success: false, error: mapped.form ?? "儲存失敗，請稍後再試" };
    }

    if (!updatedRows?.length) {
      return {
        success: false,
        error: "沒有權限更新資料，請確認已套用 merchant_shops UPDATE migration",
      };
    }

    const previousObjectKey = bunnyObjectKeyFromCdnUrl(
      currentShop.shop_avatar_path ?? "",
    );
    if (previousObjectKey?.startsWith("shop-avatars/")) {
      void deleteProfileAvatarFromBunny(previousObjectKey);
    }
  } catch {
    return { success: false, error: "儲存失敗，請稍後再試" };
  }

  revalidatePath("/profile/merchant/settings");
  revalidatePath("/profile/merchant");
  revalidatePath(`/profile/${user.id}`);
  revalidatePath("/marketplace/[id]", "page");

  return { success: true };
}

export async function updateMerchantShopTopBanner(
  cdnUrl: string,
): Promise<{ success: true } | { success: false; error: string }> {
  if (!isSupabaseConfigured()) {
    return { success: false, error: "未登入" };
  }

  const trimmedUrl = cdnUrl.trim();
  if (!trimmedUrl || !isAllowedBunnyCdnUrl(trimmedUrl)) {
    return { success: false, error: "店舖橫幅網址無效" };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: "未登入" };
  }

  try {
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle<MerchantRoleRow>();

    if (profileError || !profile) {
      return { success: false, error: "無法取得用戶資料" };
    }

    if (profile.role !== "merchant") {
      return { success: false, error: "無商戶權限" };
    }

    const ensured = await ensureMerchantShopRow(supabase, user.id);
    if (!ensured.ok) {
      return { success: false, error: ensured.error };
    }

    const { data: currentShop, error: fetchError } = await supabase
      .from("merchant_shops")
      .select("top_banner_path")
      .eq("merchant_id", user.id)
      .maybeSingle<Pick<MerchantShopSettingsRow, "top_banner_path">>();

    if (fetchError) {
      return { success: false, error: mapMerchantShopFetchError(fetchError) };
    }

    if (!currentShop) {
      return { success: false, error: "店舖尚未初始化，請完成商戶認證" };
    }

    const payload: MerchantShopUpdate = {
      top_banner_path: trimmedUrl,
      updated_at: new Date().toISOString(),
    };

    const shopsClient = supabase.from("merchant_shops") as unknown as {
      update: (values: MerchantShopUpdate) => {
        eq: (
          column: "merchant_id",
          value: string,
        ) => {
          select: (columns: "merchant_id") => Promise<{
            data: { merchant_id: string }[] | null;
            error: { code?: string; message?: string } | null;
          }>;
        };
      };
    };

    const { data: updatedRows, error: updateError } = await shopsClient
      .update(payload)
      .eq("merchant_id", user.id)
      .select("merchant_id");

    if (updateError) {
      const mapped = mapMerchantShopUpdateError(updateError);
      return { success: false, error: mapped.form ?? "儲存失敗，請稍後再試" };
    }

    if (!updatedRows?.length) {
      return {
        success: false,
        error: "沒有權限更新資料，請確認已套用 merchant_shops UPDATE migration",
      };
    }

    const previousObjectKey = bunnyObjectKeyFromCdnUrl(
      currentShop.top_banner_path ?? "",
    );
    if (previousObjectKey?.startsWith("shop-banners/")) {
      void deleteProfileAvatarFromBunny(previousObjectKey);
    }
  } catch {
    return { success: false, error: "儲存失敗，請稍後再試" };
  }

  revalidatePath("/profile/merchant/settings");
  revalidatePath("/profile/merchant");
  revalidatePath(`/profile/${user.id}`);
  revalidatePath("/marketplace/[id]", "page");

  return { success: true };
}
