import type { User } from "@supabase/supabase-js";

export function isUserEmailConfirmed(user: User): boolean {
  return Boolean(user.email_confirmed_at);
}

export function buildConfirmEmailPath(email?: string | null): string {
  if (!email?.trim()) {
    return "/auth/confirm-email";
  }

  return `/auth/confirm-email?email=${encodeURIComponent(email.trim())}`;
}
