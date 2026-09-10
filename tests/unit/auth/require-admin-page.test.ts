import type { User } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { resolveAdminPageAccess } from "@/lib/auth/require-admin";

const mockUser = { id: "user-1" } as User;

describe("resolveAdminPageAccess", () => {
  it("redirects to /auth when Supabase is not configured", () => {
    expect(
      resolveAdminPageAccess({
        configured: false,
        user: mockUser,
        isAdmin: true,
      }),
    ).toEqual({ allow: false, redirectTo: "/auth" });
  });

  it("redirects to /auth when user is missing", () => {
    expect(
      resolveAdminPageAccess({
        configured: true,
        user: null,
        isAdmin: false,
      }),
    ).toEqual({ allow: false, redirectTo: "/auth" });
  });

  it("redirects non-admin members to home", () => {
    expect(
      resolveAdminPageAccess({
        configured: true,
        user: mockUser,
        isAdmin: false,
      }),
    ).toEqual({ allow: false, redirectTo: "/" });
  });

  it("allows admin users through the layout gate", () => {
    expect(
      resolveAdminPageAccess({
        configured: true,
        user: mockUser,
        isAdmin: true,
      }),
    ).toEqual({ allow: true, user: mockUser });
  });

  it("auth-only preliminary must not treat every signed-in user as non-admin", () => {
    expect(
      resolveAdminPageAccess({
        configured: true,
        user: mockUser,
        isAdmin: false,
      }).redirectTo,
    ).toBe("/");
    expect(
      resolveAdminPageAccess({
        configured: true,
        user: mockUser,
        isAdmin: true,
      }).allow,
    ).toBe(true);
  });
});
