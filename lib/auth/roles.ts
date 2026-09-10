import type { AuthRole } from "@/app/store/useUIStore";
import type { Database } from "@/types/supabase";
import {
  defaultListingPersonaForRole,
  type ListingSellerPersona,
} from "@/lib/listings/active-listing-persona";

export type DbUserRole = Database["public"]["Enums"]["user_role"];

export function dbRoleToAuthRole(
  role: DbUserRole | null | undefined,
): AuthRole {
  switch (role) {
    case "admin":
      return "ADMIN";
    case "merchant":
      return "MERCHANT";
    case "member":
    default:
      return "USER";
  }
}

export function getRoleHomePath(role: AuthRole): string {
  return getProfileHomePath(role, defaultListingPersonaForRole(role));
}

export function getProfileHomePath(
  role: AuthRole,
  persona: ListingSellerPersona = defaultListingPersonaForRole(role),
): string {
  switch (role) {
    case "ADMIN":
      return "/admin/dashboard";
    case "GUEST":
      return "/auth";
    case "USER":
      return "/profile/user";
    case "MERCHANT":
      return persona === "member" ? "/profile/user" : "/profile/merchant";
  }
}

export function getTradingHomePath(
  role: AuthRole,
  persona: ListingSellerPersona = defaultListingPersonaForRole(role),
): string {
  switch (role) {
    case "ADMIN":
      return "/admin/user_control";
    case "GUEST":
      return "/auth";
    case "USER":
      return "/profile/user/trading";
    case "MERCHANT":
      return persona === "member"
        ? "/profile/user/trading"
        : "/profile/merchant/trading";
  }
}

export function getRoleDefaultLandingPath(role: AuthRole): string {
  switch (role) {
    case "USER":
      return "/profile/user";
    case "MERCHANT":
      return "/profile/merchant";
    case "ADMIN":
      return "/admin/dashboard";
    case "GUEST":
      return "/auth";
  }
}

export function getRoleSettingsPath(role: AuthRole): string {
  switch (role) {
    case "MERCHANT":
      return "/profile/merchant/settings";
    case "USER":
      return "/profile/user/settings";
    case "ADMIN":
      return "/admin/settings";
    case "GUEST":
      return "/auth";
  }
}

function isMemberDashboardPath(pathname: string): boolean {
  return (
    pathname === "/profile/user" || pathname.startsWith("/profile/user/")
  );
}

function isMerchantDashboardPath(pathname: string): boolean {
  return (
    pathname === "/profile/merchant" ||
    pathname.startsWith("/profile/merchant/")
  );
}

function isAdminOrderDetailPath(pathname: string): boolean {
  return (
    pathname.startsWith("/profile/user/orderDetail/") ||
    pathname.startsWith("/profile/merchant/orderDetail/")
  );
}

/** Public storefront profile (`/profile/{userId}`), not member/merchant dashboards. */
export function isPublicProfilePath(pathname: string): boolean {
  if (!pathname.startsWith("/profile/")) {
    return false;
  }

  if (isMemberDashboardPath(pathname) || isMerchantDashboardPath(pathname)) {
    return false;
  }

  const rest = pathname.slice("/profile/".length);
  const firstSegment = rest.split("/")[0];
  return firstSegment.length > 0;
}

function isAdminAllowedPath(pathname: string): boolean {
  if (pathname === "/admin" || pathname.startsWith("/admin/")) {
    return true;
  }

  if (pathname === "/auth" || pathname.startsWith("/auth/")) {
    return true;
  }

  if (pathname.startsWith("/api/")) {
    return true;
  }

  if (isAdminOrderDetailPath(pathname) || isPublicProfilePath(pathname)) {
    return true;
  }

  return false;
}

export function isPathAllowedForRole(role: AuthRole, pathname: string): boolean {
  if (role === "ADMIN") {
    return isAdminAllowedPath(pathname);
  }

  const requiresAuth =
    pathname === "/profile" ||
    isMemberDashboardPath(pathname) ||
    isMerchantDashboardPath(pathname) ||
    pathname.startsWith("/admin");

  if (role === "GUEST") {
    return !requiresAuth;
  }

  if (pathname.startsWith("/admin")) {
    return false;
  }

  if (isMerchantDashboardPath(pathname)) {
    return role === "MERCHANT";
  }

  if (pathname === "/profile" || isMemberDashboardPath(pathname)) {
    return role === "USER" || role === "MERCHANT";
  }

  return true;
}
