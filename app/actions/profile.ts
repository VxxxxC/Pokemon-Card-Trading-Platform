"use server";

import { revalidatePath } from "next/cache";
import type { MarketplaceListing } from "@/app/components/marketplace/MarketplaceCard";
import { searchMarketplaceSellerListings } from "@/app/actions/marketplace";
import { getPublicProfileReviews } from "@/app/actions/reviews";
import type { AuthRole } from "@/app/store/useUIStore";
import type {
  PublicProfileReviewItem,
  ReviewPersona,
} from "@/app/lib/reviews/types";
import { requireActiveAuthUser } from "@/lib/auth/mutation-guard";
import { resolveCurrentAuthRole, getOptionalAuthUser } from "@/lib/auth/session";
import {
  buildDualPersonaContext,
  EMPTY_DUAL_PERSONA_CONTEXT,
  type DualPersonaContext,
} from "@/lib/auth/dual-persona";
import {
  loadMarketplaceSellerProfile,
  type MarketplaceSellerProfile,
} from "@/lib/marketplace/load-seller-profile";
import { toMarketplaceCardListing } from "@/lib/marketplace/map-seller-listing";
import { mapProfileUpdateError } from "@/lib/profile/errors";
import { resolveAvatarUrl } from "@/lib/profile/avatar";
import {
  bunnyObjectKeyFromCdnUrl,
  deleteProfileAvatarFromBunny,
  isAllowedBunnyCdnUrl,
} from "@/lib/storage/bunny";
import {
  validateFpsPayoutDetails,
  validateUserProfileFields,
  type UserProfileFormErrors,
} from "@/lib/profile/validation";
import { mapProfileRowToNotificationPrefs } from "@/lib/notifications/notification-prefs";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import type { Database, Tables } from "@/types/supabase";
import { syncAutoGrantRewards } from "@/app/actions/rewards";

type ProfileRow = Pick<
  Tables<"profiles">,
  "id" | "display_name" | "avatar_path" | "role"
>;

type SettingsProfileRow = Pick<
  Tables<"profiles">,
  | "id"
  | "display_name"
  | "username"
  | "short_description"
  | "avatar_path"
  | "role"
  | "fps_id"
  | "fps_name"
  | "push_transactional"
  | "push_market_alerts"
  | "push_chat_digest"
  | "push_rewards"
  | "email_transactional"
  | "email_market_alerts"
  | "email_rewards"
>;

type ProfileUpdate = Database["public"]["Tables"]["profiles"]["Update"];

export type CurrentUserProfile = {
  id: string;
  displayName: string;
  avatarUrl: string;
  role: Tables<"profiles">["role"];
};

export type UserSettingsData = {
  id: string;
  displayName: string;
  username: string;
  shortDescription: string;
  email: string;
  avatarUrl: string;
  role: Tables<"profiles">["role"];
  bankAccount?: string;
  fpsId?: string;
  fpsName?: string;
  pushTransactional: boolean;
  pushMarketAlerts: boolean;
  pushChatDigest: boolean;
  pushRewards: boolean;
  emailTransactional: boolean;
  emailMarketAlerts: boolean;
  emailRewards: boolean;
};

export type PublicProfilePageProfile = import("@/lib/marketplace/load-seller-profile").MarketplaceSellerProfile & {
  rating: number;
  reviewCount: number;
};

export type PublicProfilePageBootstrap = {
  profile: PublicProfilePageProfile;
  reviewPersona: ReviewPersona;
  listings: MarketplaceListing[];
  totalListingCount: number;
  recentReviews: PublicProfileReviewItem[];
  warnings: {
    listings?: string;
    reviews?: string;
  };
};

export type PublicProfilePageBootstrapResult =
  | { success: true; data: PublicProfilePageBootstrap }
  | { success: false; error: string; notFound?: boolean };

export async function getPublicProfilePageBootstrap(
  profileKey: string,
  options?: { persona?: ReviewPersona },
): Promise<PublicProfilePageBootstrapResult> {
  const trimmedKey = profileKey.trim();
  if (!trimmedKey) {
    return { success: false, error: "找不到此用戶", notFound: true };
  }

  if (!isSupabaseConfigured()) {
    return { success: false, error: "無法載入個人檔案" };
  }

  try {
    const requestedPersona = options?.persona;
    const baseProfile = await loadMarketplaceSellerProfile(
      trimmedKey,
      requestedPersona,
    );
    if (!baseProfile) {
      return { success: false, error: "找不到此用戶", notFound: true };
    }

    const reviewPersona: ReviewPersona =
      requestedPersona ??
      (baseProfile.role === "merchant" ? "merchant" : "member");

    const [listingsResult, reviewsResult] = await Promise.all([
      searchMarketplaceSellerListings({
        sellerId: baseProfile.id,
        sellerPersona: reviewPersona,
        page: 1,
        pageSize: 5,
        sortKey: "最新",
      }),
      getPublicProfileReviews({
        profileId: baseProfile.id,
        persona: reviewPersona,
        sort: "date-desc",
        page: 1,
        pageSize: 3,
        cachedAggregateRating: baseProfile.ratingScore,
      }),
    ]);

    const warnings: PublicProfilePageBootstrap["warnings"] = {};
    if (!listingsResult.success) {
      warnings.listings = listingsResult.error;
    }
    if (!reviewsResult.success) {
      warnings.reviews = reviewsResult.error;
    }

    const listings = listingsResult.success
      ? listingsResult.data.listings.map((row) => toMarketplaceCardListing(row))
      : [];

    const totalListingCount = listingsResult.success
      ? listingsResult.data.meta.total
      : 0;

    const recentReviews = reviewsResult.success ? reviewsResult.data.reviews : [];
    const aggregateRating = reviewsResult.success
      ? reviewsResult.data.aggregateRating
      : baseProfile.ratingScore;
    const reviewCount = reviewsResult.success
      ? reviewsResult.data.publicReviewCount
      : 0;

    return {
      success: true,
      data: {
        profile: {
          ...baseProfile,
          rating: aggregateRating,
          reviewCount,
        },
        reviewPersona,
        listings,
        totalListingCount,
        recentReviews,
        warnings,
      },
    };
  } catch (error) {
    console.error("[getPublicProfilePageBootstrap]", error);
    return { success: false, error: "無法載入個人檔案" };
  }
}

export async function getCurrentUserRole(): Promise<
  { success: true; data: AuthRole } | { success: false; error: string }
> {
  try {
    const role = await resolveCurrentAuthRole();
    return { success: true, data: role };
  } catch {
    return { success: false, error: "無法取得用戶角色" };
  }
}

export async function getCurrentUserProfile(): Promise<
  { success: true; data: CurrentUserProfile } | { success: false; error: string }
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

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("id, display_name, avatar_path, role")
    .eq("id", user.id)
    .maybeSingle<ProfileRow>();

  if (error || !profile) {
    return { success: false, error: "無法取得用戶資料" };
  }

  return {
    success: true,
    data: {
      id: profile.id,
      displayName: profile.display_name,
      avatarUrl: resolveAvatarUrl(profile.avatar_path),
      role: profile.role,
    },
  };
}

export async function getDualPersonaContext(): Promise<
  { success: true; data: DualPersonaContext } | { success: false; error: string }
> {
  if (!isSupabaseConfigured()) {
    return { success: true, data: EMPTY_DUAL_PERSONA_CONTEXT };
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
    .select("display_name, username, role")
    .eq("id", user.id)
    .maybeSingle<Pick<Tables<"profiles">, "display_name" | "username" | "role">>();

  if (profileError || !profile) {
    return { success: false, error: "無法取得用戶資料" };
  }

  if (profile.role !== "merchant") {
    return { success: true, data: EMPTY_DUAL_PERSONA_CONTEXT };
  }

  const { data: shop, error: shopError } = await supabase
    .from("merchant_shops")
    .select("shop_name, shop_handle")
    .eq("merchant_id", user.id)
    .maybeSingle<Pick<Tables<"merchant_shops">, "shop_name" | "shop_handle">>();

  if (shopError) {
    return { success: false, error: "無法取得店舖資料" };
  }

  return {
    success: true,
    data: buildDualPersonaContext(profile, shop),
  };
}

export async function getUserSettings(): Promise<
  { success: true; data: UserSettingsData } | { success: false; error: string }
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

  const { data: profile, error } = await supabase
    .from("profiles")
    .select(
      "id, display_name, username, short_description, avatar_path, role, fps_id, fps_name, push_transactional, push_market_alerts, push_chat_digest, push_rewards, email_transactional, email_market_alerts, email_rewards",
    )
    .eq("id", user.id)
    .maybeSingle<SettingsProfileRow>();

  if (error || !profile) {
    return { success: false, error: "無法取得用戶資料" };
  }

  const notificationPrefs = mapProfileRowToNotificationPrefs(profile);

  return {
    success: true,
    data: {
      id: profile.id,
      displayName: profile.display_name,
      username: profile.username ?? "",
      shortDescription: profile.short_description ?? "",
      email: user.email ?? "",
      avatarUrl: resolveAvatarUrl(profile.avatar_path),
      role: profile.role,
      fpsId: profile.fps_id ?? "",
      fpsName: profile.fps_name ?? "",
      pushTransactional: notificationPrefs.push_transactional,
      pushMarketAlerts: notificationPrefs.push_market_alerts,
      pushChatDigest: notificationPrefs.push_chat_digest,
      pushRewards: notificationPrefs.push_rewards,
      emailTransactional: notificationPrefs.email_transactional,
      emailMarketAlerts: notificationPrefs.email_market_alerts,
      emailRewards: notificationPrefs.email_rewards,
    },
  };
}

async function isUsernameTakenByOther(
  username: string,
  userId: string,
): Promise<boolean> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("id")
    .ilike("username", username.trim())
    .neq("id", userId)
    .limit(1);

  if (error) throw error;
  return (data?.length ?? 0) > 0;
}

export async function updateUserProfile(
  _prev: UserProfileFormErrors | null,
  formData: FormData,
): Promise<UserProfileFormErrors | null> {
  const fields = {
    displayName: ((formData.get("displayName") as string | null) ?? "").trim(),
    username: ((formData.get("username") as string | null) ?? "").trim(),
    shortDescription: (
      (formData.get("shortDescription") as string | null) ?? ""
    ).trim(),
    bankAccount: ((formData.get("bankAccount") as string | null) ?? "").trim(),
    fpsId: ((formData.get("fpsId") as string | null) ?? "").trim(),
    fpsName: ((formData.get("fpsName") as string | null) ?? "").trim(),
  };

  const errors = validateUserProfileFields(fields);
  if (Object.keys(errors).length) return errors;

  const guard = await requireActiveAuthUser();
  if (!guard.ok) {
    return { form: guard.error };
  }
  const { user, supabase } = guard;

  try {
    const { data: currentProfile, error: fetchError } = await supabase
      .from("profiles")
      .select("display_name, username")
      .eq("id", user.id)
      .maybeSingle<Pick<Tables<"profiles">, "display_name" | "username">>();

    if (fetchError) {
      return { form: "無法取得用戶資料" };
    }

    if (!currentProfile) {
      return { form: "找不到用戶資料，請重新登入" };
    }

    const normalizedUsername = fields.username || null;
    const currentUsername = currentProfile.username?.trim() ?? "";

    if (
      normalizedUsername &&
      normalizedUsername.toLowerCase() !== currentUsername.toLowerCase()
    ) {
      const usernameTaken = await isUsernameTakenByOther(
        normalizedUsername,
        user.id,
      );
      if (usernameTaken) {
        return { username: "此用戶名稱已被使用" };
      }
    }

    const payload: ProfileUpdate = {
      display_name: fields.displayName,
      username: normalizedUsername,
      short_description: fields.shortDescription || null,
      fps_id: fields.fpsId || null,
      fps_name: fields.fpsName || null,
      updated_at: new Date().toISOString(),
    };

    const profilesClient = supabase.from("profiles") as unknown as {
      update: (values: ProfileUpdate) => {
        eq: (
          column: "id",
          value: string,
        ) => {
          select: (columns: "id") => Promise<{
            data: { id: string }[] | null;
            error: { code?: string; message?: string } | null;
          }>;
        };
      };
    };

    const { data: updatedRows, error: updateError } = await profilesClient
      .update(payload)
      .eq("id", user.id)
      .select("id");

    if (updateError) {
      return mapProfileUpdateError(updateError);
    }

    if (!updatedRows?.length) {
      return {
        form: "沒有權限更新資料，請確認已套用 profiles UPDATE migration",
      };
    }
  } catch {
    return { form: "儲存失敗，請稍後再試" };
  }

  revalidatePath("/profile/user/settings");
  revalidatePath("/profile/user");
  revalidatePath("/profile/user/rewards");

  void syncAutoGrantRewards();

  return null;
}

export async function updateUserFpsId(
  fpsId: string,
  fpsName: string,
): Promise<{ success: true } | { success: false; error: string }> {
  if (!isSupabaseConfigured()) {
    return { success: false, error: "未登入" };
  }

  const fieldErrors = validateFpsPayoutDetails(fpsId, fpsName);
  const firstError = fieldErrors.fpsId ?? fieldErrors.fpsName;
  if (firstError) {
    return { success: false, error: firstError };
  }

  const guard = await requireActiveAuthUser();
  if (!guard.ok) {
    return { success: false, error: guard.error };
  }
  const { user, supabase } = guard;

  try {
    const payload: ProfileUpdate = {
      fps_id: fpsId.trim(),
      fps_name: fpsName.trim(),
      updated_at: new Date().toISOString(),
    };

    const profilesClient = supabase.from("profiles") as unknown as {
      update: (values: ProfileUpdate) => {
        eq: (
          column: "id",
          value: string,
        ) => {
          select: (columns: "id") => Promise<{
            data: { id: string }[] | null;
            error: { code?: string; message?: string } | null;
          }>;
        };
      };
    };

    const { data: updatedRows, error: updateError } = await profilesClient
      .update(payload)
      .eq("id", user.id)
      .select("id");

    if (updateError) {
      const mapped = mapProfileUpdateError(updateError);
      return { success: false, error: mapped.form ?? "儲存失敗，請稍後再試" };
    }

    if (!updatedRows?.length) {
      return {
        success: false,
        error: "沒有權限更新資料，請確認已套用 profiles UPDATE migration",
      };
    }
  } catch {
    return { success: false, error: "儲存失敗，請稍後再試" };
  }

  revalidatePath("/profile/user/settings");
  revalidatePath("/profile/user");
  revalidatePath("/profile/user/trading");

  return { success: true };
}

export async function updateUserAvatar(
  cdnUrl: string,
): Promise<{ success: true } | { success: false; error: string }> {
  if (!isSupabaseConfigured()) {
    return { success: false, error: "未登入" };
  }

  const trimmedUrl = cdnUrl.trim();
  if (!trimmedUrl || !isAllowedBunnyCdnUrl(trimmedUrl)) {
    return { success: false, error: "頭像網址無效" };
  }

  const guard = await requireActiveAuthUser();
  if (!guard.ok) {
    return { success: false, error: guard.error };
  }
  const { user, supabase } = guard;

  try {
    const { data: currentProfile, error: fetchError } = await supabase
      .from("profiles")
      .select("avatar_path")
      .eq("id", user.id)
      .maybeSingle<Pick<Tables<"profiles">, "avatar_path">>();

    if (fetchError) {
      return { success: false, error: "無法取得用戶資料" };
    }

    if (!currentProfile) {
      return { success: false, error: "找不到用戶資料，請重新登入" };
    }

    const payload: ProfileUpdate = {
      avatar_path: trimmedUrl,
      updated_at: new Date().toISOString(),
    };

    const profilesClient = supabase.from("profiles") as unknown as {
      update: (values: ProfileUpdate) => {
        eq: (
          column: "id",
          value: string,
        ) => {
          select: (columns: "id") => Promise<{
            data: { id: string }[] | null;
            error: { code?: string; message?: string } | null;
          }>;
        };
      };
    };

    const { data: updatedRows, error: updateError } = await profilesClient
      .update(payload)
      .eq("id", user.id)
      .select("id");

    if (updateError) {
      const mapped = mapProfileUpdateError(updateError);
      return { success: false, error: mapped.form ?? "儲存失敗，請稍後再試" };
    }

    if (!updatedRows?.length) {
      return {
        success: false,
        error: "沒有權限更新資料，請確認已套用 profiles UPDATE migration",
      };
    }

    const previousObjectKey = bunnyObjectKeyFromCdnUrl(
      currentProfile.avatar_path ?? "",
    );
    if (previousObjectKey?.startsWith("avatars/")) {
      void deleteProfileAvatarFromBunny(previousObjectKey);
    }
  } catch {
    return { success: false, error: "儲存失敗，請稍後再試" };
  }

  revalidatePath("/profile/user");
  revalidatePath("/profile/user/settings");
  revalidatePath(`/profile/${user.id}`);

  void syncAutoGrantRewards();

  return { success: true };
}
