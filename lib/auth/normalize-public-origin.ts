/** Dev/proxy hosts that should share one browser origin for auth cookies. */
export function normalizePublicHostname(hostname: string): string {
  if (hostname === "0.0.0.0") {
    return "127.0.0.1";
  }

  return hostname;
}

export function normalizePublicOrigin(origin: string): string {
  try {
    const url = new URL(origin);
    url.hostname = normalizePublicHostname(url.hostname);
    return url.origin;
  } catch {
    return origin;
  }
}

export function normalizePublicUrl(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.hostname = normalizePublicHostname(parsed.hostname);
    return parsed.toString();
  } catch {
    return url;
  }
}
