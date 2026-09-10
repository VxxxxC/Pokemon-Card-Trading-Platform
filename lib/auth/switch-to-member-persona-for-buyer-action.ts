"use client";

import { toast } from "sonner";
import { useUIStore } from "@/app/store/useUIStore";
import { MERCHANT_BUYER_PERSONA_SWITCHED_TOAST } from "@/lib/auth/member-persona-features";

/** Switch merchant persona to member before buyer-side chat hydrate. */
export function switchToMemberPersonaForBuyerAction(): boolean {
  const { activeListingPersona, setActiveListingPersona } =
    useUIStore.getState();

  if (activeListingPersona !== "merchant") {
    return false;
  }

  setActiveListingPersona("member");
  toast.info(MERCHANT_BUYER_PERSONA_SWITCHED_TOAST);
  return true;
}
