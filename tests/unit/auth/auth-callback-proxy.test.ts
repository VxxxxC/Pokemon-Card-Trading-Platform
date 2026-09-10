import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { shouldRedirectAuthCallback } from "@/lib/auth/auth-callback-redirect";

describe("shouldRedirectAuthCallback", () => {
  it("redirects root code query to auth callback", () => {
    const request = new NextRequest("http://127.0.0.1:3000/?code=abc-123");

    expect(shouldRedirectAuthCallback(request)).toBe(true);
  });

  it("does not redirect when already on callback route", () => {
    const request = new NextRequest(
      "http://127.0.0.1:3000/auth/callback?code=abc-123",
    );

    expect(shouldRedirectAuthCallback(request)).toBe(false);
  });
});
