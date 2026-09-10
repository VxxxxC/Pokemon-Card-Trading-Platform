import { NextResponse } from "next/server";
import type { User } from "@supabase/supabase-js";
import { normalizePublicOrigin } from "@/lib/auth/normalize-public-origin";
import {
  establishAuthCallbackSession,
  shouldRedirectToPasswordResetComplete,
} from "@/lib/auth/auth-callback-session";
import {
  MEMBER_POST_CONFIRM_PATH,
  resolvePostConfirmPathFromAuth,
  sanitizePostConfirmPath,
} from "@/lib/auth/post-confirm-paths";
import { createRouteHandlerClient } from "@/lib/supabase/route-handler";
import { createAdminClient } from "@/lib/supabase/admin";

function buildEmailConfirmedRedirect(origin: string, nextPath: string): string {
  const url = new URL("/auth/email-confirmed", origin);
  if (nextPath !== MEMBER_POST_CONFIRM_PATH) {
    url.searchParams.set("next", nextPath);
  }
  return url.toString();
}

function buildAuthCallbackErrorRedirect(
  origin: string,
  reason: "auth_callback" | "auth_callback_expired",
  email?: string | null,
): string {
  const url = new URL("/auth", origin);
  url.searchParams.set("error", reason);
  if (email?.trim()) {
    url.searchParams.set("email", email.trim());
  }
  return url.toString();
}

async function resolvePostConfirmPathForUser(
  user: User,
  nextPath: string,
): Promise<string> {
  let profileRole: "admin" | "merchant" | "member" | null = null;

  try {
    const admin = createAdminClient();
    const { data: profile } = await admin
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle<{ role: "admin" | "merchant" | "member" | null }>();
    profileRole = profile?.role ?? null;
  } catch {
    profileRole = null;
  }

  return resolvePostConfirmPathFromAuth(user, nextPath, profileRole);
}

function copyResponseCookies(from: NextResponse, to: NextResponse): void {
  for (const cookie of from.cookies.getAll()) {
    to.cookies.set(cookie);
  }
}

export async function GET(request: Request): Promise<NextResponse> {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const tokenHash = requestUrl.searchParams.get("token_hash");
  const type = requestUrl.searchParams.get("type");
  const emailHint = requestUrl.searchParams.get("email");
  const nextPath = sanitizePostConfirmPath(requestUrl.searchParams.get("next"));
  const origin = normalizePublicOrigin(requestUrl.origin);

  if (!code && !tokenHash) {
    return NextResponse.redirect(
      buildAuthCallbackErrorRedirect(origin, "auth_callback", emailHint),
    );
  }

  const pendingResponse = new NextResponse();
  const supabase = await createRouteHandlerClient(pendingResponse);

  const sessionResult = await establishAuthCallbackSession(supabase, {
    code,
    tokenHash,
    type,
  });

  if (!sessionResult.ok) {
    const normalized = sessionResult.message.toLowerCase();
    const reason =
      normalized.includes("expired") || normalized.includes("invalid")
        ? "auth_callback_expired"
        : "auth_callback";
    return NextResponse.redirect(
      buildAuthCallbackErrorRedirect(origin, reason, emailHint),
    );
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (shouldRedirectToPasswordResetComplete(type, nextPath)) {
    const finalResponse = NextResponse.redirect(new URL(nextPath, origin).toString());
    copyResponseCookies(pendingResponse, finalResponse);
    return finalResponse;
  }

  if (!user?.email_confirmed_at) {
    return NextResponse.redirect(
      buildAuthCallbackErrorRedirect(origin, "auth_callback_expired", user?.email),
    );
  }

  const resolvedNext = await resolvePostConfirmPathForUser(user, nextPath);
  const finalResponse = NextResponse.redirect(
    buildEmailConfirmedRedirect(origin, resolvedNext),
  );
  copyResponseCookies(pendingResponse, finalResponse);

  return finalResponse;
}
