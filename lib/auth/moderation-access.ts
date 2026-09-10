/**
 * Paths that remain reachable while an account-level suspend/ban is active.
 */
export function isModerationExemptPath(pathname: string): boolean {
  if (pathname === "/auth" || pathname.startsWith("/auth/")) {
    return true;
  }

  if (pathname.startsWith("/api/")) {
    return true;
  }

  return false;
}
