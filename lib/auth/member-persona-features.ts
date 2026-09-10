import type { ListingSellerPersona } from "@/lib/listings/active-listing-persona";

export const MEMBER_PERSONA_FEATURES_BLOCKED_ERROR =
  "請先切換至會員身份以使用此功能";

export const MERCHANT_BUYER_PERSONA_HINT =
  "購買／叫價將以會員身份處理，訂單與聊天在會員後台查看。";

export const MERCHANT_BUYER_PERSONA_SWITCHED_TOAST =
  "已切換至會員身份以繼續交易";

export function isMemberPersona(
  persona: ListingSellerPersona | null | undefined,
): boolean {
  return persona !== "merchant";
}

export function assertMemberPersonaForPersonalFeatures(
  persona: ListingSellerPersona,
): { ok: true } | { ok: false; error: string } {
  if (!isMemberPersona(persona)) {
    return { ok: false, error: MEMBER_PERSONA_FEATURES_BLOCKED_ERROR };
  }
  return { ok: true };
}
