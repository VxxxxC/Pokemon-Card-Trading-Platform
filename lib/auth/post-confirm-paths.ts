import type { User } from "@supabase/supabase-js";
import { getRoleDefaultLandingPath } from "@/lib/auth/roles";

export const MEMBER_POST_CONFIRM_PATH = "/profile/user";
export const MERCHANT_APPLY_POST_CONFIRM_PATH = "/profile/user/merchant-apply";
export const MERCHANT_APPLY_ONBOARDING_INTENT = "merchant_apply";

export function buildSignupCallbackUrl(siteUrl: string, nextPath: string): string {
  return `${siteUrl}/auth/callback?next=${encodeURIComponent(nextPath)}`;
}

export function sanitizePostConfirmPath(next: string | null | undefined): string {
  if (!next?.startsWith("/")) {
    return MEMBER_POST_CONFIRM_PATH;
  }

  return next;
}

export function hasMerchantApplyOnboardingIntent(
  user: Pick<User, "user_metadata">,
): boolean {
  return (
    user.user_metadata?.onboarding_intent === MERCHANT_APPLY_ONBOARDING_INTENT
  );
}

export function resolvePostConfirmPathFromAuth(
  user: Pick<User, "user_metadata">,
  nextPath: string,
  profileRole?: "admin" | "merchant" | "member" | null,
): string {
  const sanitizedNext = sanitizePostConfirmPath(nextPath);

  if (sanitizedNext === MERCHANT_APPLY_POST_CONFIRM_PATH) {
    return MERCHANT_APPLY_POST_CONFIRM_PATH;
  }

  if (hasMerchantApplyOnboardingIntent(user)) {
    return MERCHANT_APPLY_POST_CONFIRM_PATH;
  }

  if (sanitizedNext !== MEMBER_POST_CONFIRM_PATH) {
    return sanitizedNext;
  }

  switch (profileRole) {
    case "admin":
      return getRoleDefaultLandingPath("ADMIN");
    case "merchant":
      return getRoleDefaultLandingPath("MERCHANT");
    case "member":
      return getRoleDefaultLandingPath("USER");
    default:
      return MEMBER_POST_CONFIRM_PATH;
  }
}
