/** Exact routes that match BottomNav destinations (首頁 / 大盤 / 交易 / 會員). */
const BOTTOM_NAV_PATHS = new Set([
  "/",
  "/marketplace",
  "/profile/user",
  "/profile/merchant",
  "/profile/user/collection",
  "/profile/user/inventory",
  "/profile/user/trading",
  "/profile/merchant/inventory",
  "/profile/merchant/trading",
  "/profile/merchant/finance",
]);

export function isUserProfileHubPath(pathname: string): boolean {
  return (
    pathname === "/profile/user" ||
    pathname === "/profile/merchant" ||
    pathname === "/profile/user/collection" ||
    pathname === "/profile/user/inventory" ||
    pathname === "/profile/merchant/inventory" ||
    pathname === "/profile/merchant/finance"
  );
}

/**
 * Bottom nav only on the four hub screens — hidden on sub-flows (product detail, settings, etc.).
 */
export function shouldShowBottomNav(pathname: string): boolean {
  return BOTTOM_NAV_PATHS.has(pathname);
}
