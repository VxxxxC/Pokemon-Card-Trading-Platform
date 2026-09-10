import type { NextRequest } from "next/server";
import { normalizePublicHostname } from "@/lib/auth/normalize-public-origin";

/** Browser hostname from Host / X-Forwarded-Host (not the dev bind address). */
export function getBrowserHostname(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-host");
  const host = forwarded ?? request.headers.get("host");
  if (host) {
    const hostname = host.split(",")[0]?.trim().split(":")[0]?.trim();
    if (hostname) {
      return hostname;
    }
  }

  return request.nextUrl.hostname;
}

export function getNormalizedBrowserHostname(request: NextRequest): string {
  return normalizePublicHostname(getBrowserHostname(request));
}
