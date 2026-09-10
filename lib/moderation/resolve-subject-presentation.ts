import type { AdminModerationSubjectPreview, ViolationPersona } from "@/lib/moderation/types";
import type { Database } from "@/types/supabase";
import type { SupabaseClient } from "@supabase/supabase-js";

type ProfileRoleRow = Pick<
  Database["public"]["Tables"]["profiles"]["Row"],
  "id" | "display_name" | "username" | "role"
>;

type MerchantShopRow = Pick<
  Database["public"]["Tables"]["merchant_shops"]["Row"],
  "merchant_id" | "shop_name" | "shop_handle"
>;

export function shouldPresentModerationSubjectAsMerchant(input: {
  profileRole: string | null | undefined;
  violationPersona?: ViolationPersona | null;
}): boolean {
  if (
    input.violationPersona === "merchant" ||
    input.violationPersona === "both"
  ) {
    return true;
  }
  if (input.violationPersona === "member") {
    return false;
  }
  return input.profileRole === "merchant";
}

export function resolveModerationSubjectPresentation(input: {
  profile: Pick<ProfileRoleRow, "display_name" | "username" | "role">;
  shop: MerchantShopRow | null | undefined;
  violationPersona?: ViolationPersona | null;
}): Pick<AdminModerationSubjectPreview, "displayName" | "username"> {
  const asMerchant = shouldPresentModerationSubjectAsMerchant({
    profileRole: input.profile.role,
    violationPersona: input.violationPersona,
  });

  if (asMerchant) {
    return {
      displayName:
        input.shop?.shop_name?.trim() ||
        input.shop?.shop_handle?.trim() ||
        input.profile.display_name?.trim() ||
        "認證商戶",
      username:
        input.shop?.shop_handle?.trim() ||
        input.profile.username?.trim() ||
        null,
    };
  }

  return {
    displayName: input.profile.display_name?.trim() || null,
    username: input.profile.username?.trim() || null,
  };
}

export async function enrichModerationSubjectPreviews(
  supabase: Pick<SupabaseClient<Database>, "from">,
  items: ReadonlyArray<{
    subject: AdminModerationSubjectPreview;
    violationPersona?: ViolationPersona | null;
    profileRole?: string | null;
  }>,
): Promise<void> {
  const subjectIds = [
    ...new Set(items.map((item) => item.subject.id).filter(Boolean)),
  ];
  if (subjectIds.length === 0) {
    return;
  }

  const [profilesResult, shopsResult] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, display_name, username, role")
      .in("id", subjectIds),
    supabase
      .from("merchant_shops")
      .select("merchant_id, shop_name, shop_handle")
      .in("merchant_id", subjectIds),
  ]);

  if (profilesResult.error) {
    console.error(
      "[enrichModerationSubjectPreviews] profiles",
      profilesResult.error.message,
    );
    return;
  }

  if (shopsResult.error) {
    console.error(
      "[enrichModerationSubjectPreviews] merchant_shops",
      shopsResult.error.message,
    );
  }

  const profilesById = new Map<string, ProfileRoleRow>();
  for (const row of (profilesResult.data ?? []) as ProfileRoleRow[]) {
    profilesById.set(row.id, row);
  }

  const shopsByMerchantId = new Map<string, MerchantShopRow>();
  for (const row of (shopsResult.data ?? []) as MerchantShopRow[]) {
    shopsByMerchantId.set(row.merchant_id, row);
  }

  for (const item of items) {
    const profile = profilesById.get(item.subject.id);
    if (!profile) {
      continue;
    }

    const resolved = resolveModerationSubjectPresentation({
      profile,
      shop: shopsByMerchantId.get(item.subject.id) ?? null,
      violationPersona: item.violationPersona,
    });

    item.subject.displayName = resolved.displayName;
    item.subject.username = resolved.username;
  }
}
