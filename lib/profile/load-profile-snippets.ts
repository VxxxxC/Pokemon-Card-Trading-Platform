import { resolveAvatarUrl } from "@/lib/profile/avatar";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";

export type ProfileSnippet = {
  username: string | null;
  avatarUrl: string;
};

export type ListingSellerSnippet = {
  displayName: string;
  username: string | null;
  avatarUrl: string;
};

type SellerPersona = Database["public"]["Enums"]["seller_persona_type"];

type ProfileSnippetRow = Pick<
  Database["public"]["Views"]["public_profiles"]["Row"],
  "id" | "username" | "display_name" | "avatar_path"
>;

type MerchantShopSnippetRow = Pick<
  Database["public"]["Tables"]["merchant_shops"]["Row"],
  "merchant_id" | "shop_name" | "shop_handle" | "shop_avatar_path"
>;

export function listingSellerSnippetKey(
  sellerId: string,
  sellerPersona: SellerPersona,
): string {
  return `${sellerId}:${sellerPersona}`;
}

export async function loadProfileSnippetsByIds(
  supabase: SupabaseClient<Database>,
  profileIds: string[],
): Promise<Map<string, ProfileSnippet>> {
  const uniqueIds = [...new Set(profileIds.filter(Boolean))];
  if (uniqueIds.length === 0) {
    return new Map();
  }

  const { data, error } = await supabase
    .from("public_profiles")
    .select("id, username, avatar_path")
    .in("id", uniqueIds);

  if (error) {
    console.error("[loadProfileSnippetsByIds]", error.message);
    return new Map();
  }

  const snippets = new Map<string, ProfileSnippet>();
  for (const row of (data ?? []) as ProfileSnippetRow[]) {
    if (!row.id) {
      continue;
    }
    snippets.set(row.id, {
      username: row.username?.trim() || null,
      avatarUrl: resolveAvatarUrl(row.avatar_path),
    });
  }

  return snippets;
}

export async function loadListingSellerSnippets(
  supabase: Pick<SupabaseClient<Database>, "from">,
  rows: ReadonlyArray<{ sellerId: string; sellerPersona: SellerPersona }>,
): Promise<Map<string, ListingSellerSnippet>> {
  const uniqueSellerIds = [
    ...new Set(rows.map((row) => row.sellerId).filter(Boolean)),
  ];
  if (uniqueSellerIds.length === 0) {
    return new Map();
  }

  const [profilesResult, shopsResult] = await Promise.all([
    supabase
      .from("public_profiles")
      .select("id, username, display_name, avatar_path")
      .in("id", uniqueSellerIds),
    supabase
      .from("merchant_shops")
      .select("merchant_id, shop_name, shop_handle, shop_avatar_path")
      .in("merchant_id", uniqueSellerIds),
  ]);

  if (profilesResult.error) {
    console.error(
      "[loadListingSellerSnippets] public_profiles",
      profilesResult.error.message,
    );
    return new Map();
  }

  if (shopsResult.error) {
    console.error(
      "[loadListingSellerSnippets] merchant_shops",
      shopsResult.error.message,
    );
  }

  const profilesById = new Map<string, ProfileSnippetRow>();
  for (const row of (profilesResult.data ?? []) as ProfileSnippetRow[]) {
    if (!row.id) {
      continue;
    }
    profilesById.set(row.id, row);
  }

  const shopsByMerchantId = new Map<string, MerchantShopSnippetRow>();
  for (const row of (shopsResult.data ?? []) as MerchantShopSnippetRow[]) {
    shopsByMerchantId.set(row.merchant_id, row);
  }

  const snippets = new Map<string, ListingSellerSnippet>();
  const seenKeys = new Set<string>();

  for (const row of rows) {
    const key = listingSellerSnippetKey(row.sellerId, row.sellerPersona);
    if (seenKeys.has(key)) {
      continue;
    }
    seenKeys.add(key);

    const profile = profilesById.get(row.sellerId);
    const shop = shopsByMerchantId.get(row.sellerId);
    const memberDisplayName = profile?.display_name?.trim() || "平台用戶";

    if (row.sellerPersona === "merchant") {
      snippets.set(key, {
        displayName:
          shop?.shop_name?.trim() ||
          profile?.display_name?.trim() ||
          shop?.shop_handle?.trim() ||
          profile?.username?.trim() ||
          "平台用戶",
        username: shop?.shop_handle?.trim() || profile?.username?.trim() || null,
        avatarUrl: resolveAvatarUrl(shop?.shop_avatar_path),
      });
      continue;
    }

    snippets.set(key, {
      displayName: memberDisplayName,
      username: profile?.username?.trim() || null,
      avatarUrl: resolveAvatarUrl(profile?.avatar_path),
    });
  }

  return snippets;
}
