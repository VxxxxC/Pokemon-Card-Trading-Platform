import {
  getMainTitle,
  resolveMemberReputationTagDisplay,
  resolveMerchantReputationTagDisplay,
} from "@/lib/constants/titles";
import { isMerchantPayoutReady } from "@/lib/stripe/payout-ready";
import {
  formatSellerJoinDate,
  isUuid,
  resolveActivityBadgeEmoji,
} from "@/lib/marketplace/seller-profile";
import { resolveAvatarUrl, resolveOptionalMediaUrl } from "@/lib/profile/avatar";
import { createPublicClient } from "@/lib/supabase/public";
import type { Json, Tables } from "@/types/supabase";
import type { ReviewPersona } from "@/app/lib/reviews/types";

export type MarketplaceSellerBadge = {
  id: string;
  label: string;
  emoji: string;
  desc: string;
};

export type MarketplaceSellerProfile = {
  id: string;
  username: string;
  handle: string;
  joinDate: string;
  avatarUrl: string;
  bio: string;
  level: string;
  verifiedBuyer: boolean;
  completedTrades: number;
  badges: MarketplaceSellerBadge[];
  role: Tables<"profiles">["role"];
  ratingScore: number;
  reputationTag: Json | null;
  kycVerified?: boolean;
  stripeConnected?: boolean;
  topBannerUrl?: string | null;
};

type PublicProfileRow = {
  id: string;
  display_name: string;
  username: string | null;
  short_description: string | null;
  created_at: string;
  completed_trades_count: number;
  rating_score: number | null;
  reputation_tag: Json | null;
  is_merchant: boolean;
  avatar_path: string | null;
};

type MerchantVerification = {
  kyc_status: Tables<"kyc_records">["kyc_status"] | null;
  stripe_charges_enabled: boolean;
  stripe_payouts_enabled: boolean;
  verified: boolean;
};

type MerchantShopRow = Pick<
  Tables<"merchant_shops">,
  | "shop_name"
  | "shop_handle"
  | "shop_description"
  | "shop_avatar_path"
  | "top_banner_path"
  | "reputation_tag"
  | "created_at"
  | "completed_trades_count"
  | "rating_score"
>;

function mapBadges(
  isMerchant: boolean,
  profileTag: Json | null,
  merchantTag: Json | null,
): MarketplaceSellerBadge[] {
  const activityBadges = isMerchant
    ? resolveMerchantReputationTagDisplay(merchantTag).activityBadges
    : resolveMemberReputationTagDisplay(profileTag).activityBadges;

  return activityBadges.map((badge) => ({
    id: badge.id,
    label: badge.nameZh,
    emoji: resolveActivityBadgeEmoji(badge.category),
    desc: badge.description,
  }));
}

function resolveLevelLabel(
  profile: PublicProfileRow,
  merchantShop: MerchantShopRow | null,
): string {
  const isMerchant = profile.is_merchant;
  const titleFromTag = isMerchant
    ? resolveMerchantReputationTagDisplay(merchantShop?.reputation_tag ?? null)
        .merchantTitle
    : resolveMemberReputationTagDisplay(profile.reputation_tag).memberTitle;

  if (titleFromTag) {
    return titleFromTag.nameZh;
  }

  const completedTrades = isMerchant
    ? (merchantShop?.completed_trades_count ?? profile.completed_trades_count)
    : profile.completed_trades_count;

  const fallback = getMainTitle(completedTrades, {
    isMerchant,
    rating: isMerchant
      ? (merchantShop?.rating_score ?? profile.rating_score ?? undefined)
      : undefined,
    hasMerchantShop: isMerchant && merchantShop != null,
  });

  return fallback?.nameZh ?? (isMerchant ? "認證商戶" : "平台會員");
}

function resolveSellerReputationTag(
  isMerchant: boolean,
  profileTag: Json | null,
  merchantTag: Json | null,
): Json | null {
  return isMerchant ? (merchantTag ?? null) : profileTag;
}

function mapProfileRow(
  profile: PublicProfileRow,
  merchantShop: MerchantShopRow | null,
  kyc: MerchantVerification | null = null,
  viewPersona?: ReviewPersona,
): MarketplaceSellerProfile {
  const hasDualPersona = profile.is_merchant && merchantShop != null;
  const showMerchantIdentity = hasDualPersona
    ? viewPersona !== "member"
    : profile.is_merchant;
  const isMerchant = showMerchantIdentity;
  const completedTrades = isMerchant
    ? (merchantShop?.completed_trades_count ?? profile.completed_trades_count)
    : profile.completed_trades_count;

  const username = isMerchant
    ? merchantShop?.shop_name?.trim() || "認證商戶"
    : profile.display_name?.trim() || "平台用戶";

  const handleUsername = isMerchant
    ? merchantShop?.shop_handle?.trim()
    : profile.username?.trim();
  const handle = handleUsername
    ? `@${handleUsername}`
    : `@${profile.id.slice(0, 8)}`;

  const bio =
    (isMerchant ? merchantShop?.shop_description?.trim() : null) ||
    profile.short_description?.trim() ||
    "此賣家尚未填寫櫥窗簡介。";

  const ratingScore = isMerchant
    ? Number(merchantShop?.rating_score ?? profile.rating_score ?? 0)
    : Number(profile.rating_score ?? 0);

  const avatarUrl = isMerchant
    ? resolveAvatarUrl(merchantShop?.shop_avatar_path)
    : resolveAvatarUrl(profile.avatar_path);

  const reputationTag = resolveSellerReputationTag(
    isMerchant,
    profile.reputation_tag,
    merchantShop?.reputation_tag ?? null,
  );

  return {
    id: profile.id,
    username,
    handle,
    joinDate: formatSellerJoinDate(
      isMerchant && merchantShop?.created_at
        ? merchantShop.created_at
        : profile.created_at,
    ),
    avatarUrl,
    bio,
    level: resolveLevelLabel(profile, merchantShop),
    verifiedBuyer: isMerchant,
    completedTrades,
    badges: mapBadges(isMerchant, profile.reputation_tag, merchantShop?.reputation_tag ?? null),
    role: profile.is_merchant ? "merchant" : "member",
    ratingScore,
    reputationTag,
    ...(isMerchant
      ? {
          kycVerified: kyc?.verified === true,
          stripeConnected: isMerchantPayoutReady(
            kyc
              ? {
                  kyc_status: kyc.kyc_status,
                  stripe_charges_enabled: kyc.stripe_charges_enabled,
                  stripe_payouts_enabled: kyc.stripe_payouts_enabled,
                  stripe_account_id: null,
                }
              : null,
          ),
          topBannerUrl: resolveOptionalMediaUrl(merchantShop?.top_banner_path),
        }
      : {}),
  };
}

async function fetchProfileById(
  profileId: string,
  viewPersona?: ReviewPersona,
): Promise<MarketplaceSellerProfile | null> {
  const supabase = createPublicClient();

  const { data: profile, error } = await supabase
    .from("public_profiles")
    .select(
      "id, display_name, username, short_description, created_at, completed_trades_count, rating_score, reputation_tag, is_merchant, avatar_path",
    )
    .eq("id", profileId)
    .maybeSingle<PublicProfileRow>();

  if (error) {
    console.error("[loadSellerProfileById]", error.message);
    throw new Error("無法載入商戶資料");
  }

  if (!profile) {
    return null;
  }

  let merchantShop: MerchantShopRow | null = null;
  let kyc: MerchantVerification | null = null;
  if (profile.is_merchant) {
    const [shopResult, kycResult] = await Promise.all([
      supabase
        .from("merchant_shops")
        .select(
          "shop_name, shop_handle, shop_description, shop_avatar_path, top_banner_path, reputation_tag, created_at, completed_trades_count, rating_score",
        )
        .eq("merchant_id", profile.id)
        .maybeSingle<MerchantShopRow>(),
      supabase.rpc("fn_get_merchant_public_verification", {
        p_merchant_id: profile.id,
      }),
    ]);

    if (shopResult.error) {
      console.error("[loadSellerProfileById] merchant_shops", shopResult.error.message);
    } else {
      merchantShop = shopResult.data;
    }

    if (kycResult.error) {
      console.error(
        "[loadSellerProfileById] fn_get_merchant_public_verification",
        kycResult.error.message,
      );
    } else {
      kyc = kycResult.data as MerchantVerification;
    }
  }

  if (
    profile.is_merchant &&
    kyc?.kyc_status !== "verified" &&
    viewPersona !== "member"
  ) {
    return null;
  }

  return mapProfileRow(profile, merchantShop, kyc, viewPersona);
}

async function fetchProfileByMemberUsername(
  username: string,
  viewPersona?: ReviewPersona,
): Promise<MarketplaceSellerProfile | null> {
  const supabase = createPublicClient();

  const { data: profile, error } = await supabase
    .from("public_profiles")
    .select(
      "id, display_name, username, short_description, created_at, completed_trades_count, rating_score, reputation_tag, is_merchant, avatar_path",
    )
    .ilike("username", username.trim())
    .maybeSingle<PublicProfileRow>();

  if (error) {
    console.error("[loadSellerProfileByMemberUsername]", error.message);
    throw new Error("無法載入商戶資料");
  }

  if (!profile) {
    return null;
  }

  return fetchProfileById(profile.id, viewPersona);
}

async function fetchProfileByMerchantShopHandle(
  shopHandle: string,
  viewPersona?: ReviewPersona,
): Promise<MarketplaceSellerProfile | null> {
  const supabase = createPublicClient();

  const { data: shop, error } = await supabase
    .from("merchant_shops")
    .select("merchant_id")
    .ilike("shop_handle", shopHandle.trim())
    .maybeSingle<Pick<Tables<"merchant_shops">, "merchant_id">>();

  if (error) {
    console.error("[loadSellerProfileByMerchantShopHandle]", error.message);
    throw new Error("無法載入商戶資料");
  }

  if (!shop?.merchant_id) {
    return null;
  }

  return fetchProfileById(shop.merchant_id, viewPersona ?? "merchant");
}

export {
  resolveSellerReputationTag,
  resolveLevelLabel,
};

export async function loadMarketplaceSellerProfile(
  sellerKey: string,
  viewPersona?: ReviewPersona,
): Promise<MarketplaceSellerProfile | null> {
  const trimmed = sellerKey.trim();
  if (!trimmed) {
    return null;
  }

  if (isUuid(trimmed)) {
    return fetchProfileById(trimmed, viewPersona);
  }

  const byMerchantHandle = await fetchProfileByMerchantShopHandle(trimmed, viewPersona);
  if (byMerchantHandle) {
    return byMerchantHandle;
  }

  return fetchProfileByMemberUsername(trimmed, viewPersona);
}
