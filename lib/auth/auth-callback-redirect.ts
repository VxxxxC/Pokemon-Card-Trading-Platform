import type { NextRequest } from "next/server";

export function shouldRedirectAuthCallback(request: NextRequest): boolean {
  const { pathname, searchParams } = request.nextUrl;

  if (pathname === "/auth/callback") {
    return false;
  }

  return searchParams.has("code") || searchParams.has("token_hash");
}
