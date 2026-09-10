import { describe, expect, it } from "vitest";
import {
  buildConfirmEmailPath,
  isUserEmailConfirmed,
} from "@/lib/auth/email-confirmation";

describe("email-confirmation", () => {
  it("detects unconfirmed users", () => {
    expect(
      isUserEmailConfirmed({
        id: "u1",
        app_metadata: {},
        user_metadata: {},
        aud: "authenticated",
        created_at: "",
      }),
    ).toBe(false);

    expect(
      isUserEmailConfirmed({
        id: "u1",
        app_metadata: {},
        user_metadata: {},
        aud: "authenticated",
        created_at: "",
        email_confirmed_at: "2026-01-01T00:00:00.000Z",
      }),
    ).toBe(true);
  });

  it("builds confirm email path with encoded email", () => {
    expect(buildConfirmEmailPath("user@example.com")).toBe(
      "/auth/confirm-email?email=user%40example.com",
    );
  });
});
