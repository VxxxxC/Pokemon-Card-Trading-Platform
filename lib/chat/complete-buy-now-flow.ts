"use client";

import type { AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";
import type { BuyNowListingPayload } from "@/app/actions/buy-now";
import { switchToMemberPersonaForBuyerAction } from "@/lib/auth/switch-to-member-persona-for-buyer-action";
import { openBuyNowChatSession } from "@/lib/chat/open-buy-now-session";

/** Hydrate chat, then redirect merchant buyers to checkout when applicable. */
export function completeBuyNowFlow(
  payload: BuyNowListingPayload,
  router: AppRouterInstance,
): "checkout" | "chat" {
  switchToMemberPersonaForBuyerAction();
  openBuyNowChatSession(payload);

  const checkoutHref = payload.checkoutHref ?? payload.paymentHref ?? null;
  if (checkoutHref) {
    router.push(checkoutHref);
    return "checkout";
  }

  return "chat";
}
