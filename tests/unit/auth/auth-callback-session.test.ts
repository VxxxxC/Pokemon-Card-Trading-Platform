import { describe, expect, it } from "vitest";
import {
  isPkceAuthToken,
  shouldRedirectToPasswordResetComplete,
} from "@/lib/auth/auth-callback-session";

describe("auth-callback-session", () => {
  it("detects pkce auth tokens", () => {
    expect(isPkceAuthToken("pkce_abc")).toBe(true);
    expect(isPkceAuthToken("otp_hash")).toBe(false);
  });

  it("routes recovery by type or forgot-password next path", () => {
    expect(shouldRedirectToPasswordResetComplete("recovery")).toBe(true);
    expect(
      shouldRedirectToPasswordResetComplete(null, "/auth/forgot-password/complete"),
    ).toBe(true);
    expect(shouldRedirectToPasswordResetComplete("signup", "/profile/user")).toBe(
      false,
    );
  });
});
