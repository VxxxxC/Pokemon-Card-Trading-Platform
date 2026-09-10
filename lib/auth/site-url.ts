import { headers } from "next/headers";
import { normalizePublicHostname } from "@/lib/auth/normalize-public-origin";

/** Origin used for Supabase auth redirect URLs (password reset, etc.). */
export async function getSiteUrl(): Promise<string> {
  try {
    const headerList = await headers();
    const host = headerList.get("x-forwarded-host") ?? headerList.get("host");
    const protocol = headerList.get("x-forwarded-proto") ?? "http";

    if (host) {
      const hostname = host.split(":")[0] ?? host;
      const port = host.includes(":") ? host.split(":")[1] : undefined;
      const normalizedHost = normalizePublicHostname(hostname);
      const hostWithPort =
        port && port !== "80" && port !== "443"
          ? `${normalizedHost}:${port}`
          : normalizedHost;
      return `${protocol}://${hostWithPort}`;
    }
  } catch {
    // Outside a Next.js request (CLI scripts, cron, tests).
  }

  const configured = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");
  if (configured) return configured;

  return "http://localhost:3000";
}
