import { describe, expect, it } from "vitest";
import { isPathAllowedForRole } from "@/lib/auth/roles";

describe("isPathAllowedForRole", () => {
  it("allows guests on public profile routes that share a user prefix", () => {
    expect(
      isPathAllowedForRole("GUEST", "/profile/user_f9bc1c74c6"),
    ).toBe(true);
    expect(
      isPathAllowedForRole("GUEST", "/profile/user_f9bc1c74c6/rating"),
    ).toBe(true);
  });

  it("still protects member dashboard routes for guests", () => {
    expect(isPathAllowedForRole("GUEST", "/profile/user")).toBe(false);
    expect(isPathAllowedForRole("GUEST", "/profile/user/collection")).toBe(
      false,
    );
  });

  it("still protects merchant dashboard routes for guests", () => {
    expect(isPathAllowedForRole("GUEST", "/profile/merchant")).toBe(false);
    expect(isPathAllowedForRole("GUEST", "/profile/merchant/trading")).toBe(
      false,
    );
  });

  it("restricts admin to admin console, auth, api, and read-only order/profile routes", () => {
    expect(isPathAllowedForRole("ADMIN", "/admin/dashboard")).toBe(true);
    expect(isPathAllowedForRole("ADMIN", "/auth")).toBe(true);
    expect(isPathAllowedForRole("ADMIN", "/api/admin/upload-announcement-image")).toBe(
      true,
    );
    expect(
      isPathAllowedForRole("ADMIN", "/profile/user/orderDetail/ORD-2026-ABC123"),
    ).toBe(true);
    expect(
      isPathAllowedForRole(
        "ADMIN",
        "/profile/merchant/orderDetail/550e8400-e29b-41d4-a716-446655440000",
      ),
    ).toBe(true);
    expect(isPathAllowedForRole("ADMIN", "/profile/user_f9bc1c74c6")).toBe(true);
    expect(isPathAllowedForRole("ADMIN", "/")).toBe(false);
    expect(isPathAllowedForRole("ADMIN", "/profile/user")).toBe(false);
    expect(isPathAllowedForRole("ADMIN", "/profile/merchant")).toBe(false);
    expect(isPathAllowedForRole("ADMIN", "/profile/user/trading")).toBe(false);
    expect(isPathAllowedForRole("ADMIN", "/marketplace")).toBe(false);
  });

  it("blocks non-admin users from admin routes", () => {
    expect(isPathAllowedForRole("USER", "/admin/dashboard")).toBe(false);
    expect(isPathAllowedForRole("MERCHANT", "/admin/dashboard")).toBe(false);
    expect(isPathAllowedForRole("USER", "/admin/settings")).toBe(false);
    expect(isPathAllowedForRole("USER", "/admin/catalog")).toBe(false);
    expect(isPathAllowedForRole("USER", "/admin/announcements")).toBe(false);
  });
});
