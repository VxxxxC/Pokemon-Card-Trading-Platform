import { afterEach, describe, expect, it } from "vitest";
import { isAppleSafariInstallContext } from "@/lib/pwa/detect-apple-safari";

describe("isAppleSafariInstallContext", () => {
  const originalNavigator = global.navigator;

  afterEach(() => {
    Object.defineProperty(global, "navigator", {
      value: originalNavigator,
      configurable: true,
    });
  });

  function mockUserAgent(ua: string) {
    Object.defineProperty(global, "navigator", {
      value: { userAgent: ua },
      configurable: true,
    });
  }

  it("returns true for iPhone Safari", () => {
    mockUserAgent(
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
    );
    expect(isAppleSafariInstallContext()).toBe(true);
  });

  it("returns true for macOS Safari", () => {
    mockUserAgent(
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",
    );
    expect(isAppleSafariInstallContext()).toBe(true);
  });

  it("returns false for Chrome on macOS", () => {
    mockUserAgent(
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    );
    expect(isAppleSafariInstallContext()).toBe(false);
  });
});
