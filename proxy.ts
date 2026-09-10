import { type NextRequest, NextResponse } from "next/server";
import type { Tables } from "@/types/supabase";
import type { AuthRole } from "@/app/store/useUIStore";
import { isModerationExemptPath } from "@/lib/auth/moderation-access";
import {
  dbRoleToAuthRole,
  getRoleHomePath,
  isPathAllowedForRole,
} from "@/lib/auth/roles";
import { shouldRedirectAuthCallback } from "@/lib/auth/auth-callback-redirect";
import {
  getBrowserHostname,
  getNormalizedBrowserHostname,
} from "@/lib/auth/request-host";
import { updateSession } from "@/lib/supabase/middleware";

type ProfileRoleRow = Pick<Tables<"profiles">, "role">;

type AccountAccessRestriction = {
  blocked?: boolean;
  type?: string;
  endsAt?: string | null;
};

type ModerationAccessRpcClient = {
  rpc(
    fn: "moderation_get_account_access_restriction",
    args: { p_user_id: string },
  ): Promise<{ data: unknown; error: { message: string } | null }>;
};

export async function proxy(request: NextRequest) {
  if (shouldRedirectAuthCallback(request)) {
    const url = request.nextUrl.clone();
    url.hostname = getNormalizedBrowserHostname(request);
    url.pathname = "/auth/callback";
    return NextResponse.redirect(url);
  }

  // Dev server binds 0.0.0.0; nextUrl.hostname may be 0.0.0.0 while Host is 127.0.0.1.
  if (getBrowserHostname(request) === "0.0.0.0") {
    const url = request.nextUrl.clone();
    url.hostname = "127.0.0.1";
    return NextResponse.redirect(url);
  }

  const { supabase, user, response } = await updateSession(request);

  let role: AuthRole = "GUEST";
  let profileRole: Tables<"profiles">["role"] | null = null;

  if (user && supabase) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle<ProfileRoleRow>();
    profileRole = profile?.role ?? null;
    role = dbRoleToAuthRole(profileRole);
  }

  const { pathname } = request.nextUrl;

  if (
    user &&
    supabase &&
    profileRole !== "admin" &&
    !isModerationExemptPath(pathname)
  ) {
    const { data: restrictionRaw } = await (
      supabase as unknown as ModerationAccessRpcClient
    ).rpc("moderation_get_account_access_restriction", {
      p_user_id: user.id,
    });

    const restriction = restrictionRaw as AccountAccessRestriction | null;
    if (restriction?.blocked) {
      const url = request.nextUrl.clone();
      url.pathname = "/auth/suspended";
      url.search = "";
      if (restriction.type) {
        url.searchParams.set("type", restriction.type);
      }
      if (restriction.endsAt) {
        url.searchParams.set("until", restriction.endsAt);
      }
      return NextResponse.redirect(url);
    }
  }

  if (isPathAllowedForRole(role, pathname)) {
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set("x-pathname", pathname);
    const nextResponse = NextResponse.next({
      request: { headers: requestHeaders },
    });
    response.cookies.getAll().forEach((cookie) => {
      nextResponse.cookies.set(cookie.name, cookie.value);
    });
    return nextResponse;
  }

  if (role === "GUEST") {
    const url = request.nextUrl.clone();
    url.pathname = "/auth";
    if (pathname !== "/auth") {
      url.searchParams.set("redirect", pathname);
    }
    return NextResponse.redirect(url);
  }

  const url = request.nextUrl.clone();
  url.pathname = getRoleHomePath(role);
  url.search = "";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
